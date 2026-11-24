import {
  ArgumentError,
  AuthRequiredError,
  CommandExecutionError,
  ConfigError,
  EmptyResultError,
} from "@jackwener/opencli/errors";
import { inspectPortal } from "./inspect.js";

export function portalConfig(raw = process.env.POWERSCHOOL_URL) {
  const hint =
    "Set POWERSCHOOL_URL to your district's HTTPS PowerSchool parent sign-in URL.";
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new ConfigError("POWERSCHOOL_URL is missing or invalid.", hint);
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new ConfigError(
      "POWERSCHOOL_URL must be an HTTPS URL without credentials, a query, or a fragment.",
      hint,
    );
  }
  if (url.pathname === "/") url.pathname = "/public/";
  if (url.pathname.endsWith("/public")) url.pathname += "/";
  if (!/\/public\/(?:[^/]+\.html?)?$/i.test(url.pathname)) {
    throw new ConfigError(
      "POWERSCHOOL_URL must point to the PowerSchool /public/ sign-in page.",
      hint,
    );
  }
  return {
    login: url.href,
    home: new URL("../guardian/home.html", url).href,
    origin: url.origin,
  };
}

const auth = (config, message = "PowerSchool sign-in is required.") =>
  new AuthRequiredError(
    new URL(config.origin).host,
    message,
    "Run `opencli powerschool login` with a connected Chrome profile. If autofill needs interaction, sign in manually in that profile, then retry.",
  );
const inspect = (page, config, surface = "session") =>
  page.evaluate(inspectPortal, config.origin, surface);
const requireGuardian = (state, config) => {
  if (state?.kind === "login") throw auth(config);
  if (state?.kind !== "guardian") {
    throw new CommandExecutionError(
      "PowerSchool did not show a recognized guardian page.",
      "Check the portal URL and whether this district uses a separate sign-in page.",
    );
  }
};
const requireOpen = (state) => {
  if (state.closed)
    throw new CommandExecutionError(
      "The district has closed the PowerSchool portal.",
      "Retry when the district reopens access. `powerschool students` may still work.",
    );
};
const requireStudent = (state, id) => {
  if (!id || state.studentId !== id) {
    throw new CommandExecutionError(
      "Cannot verify which student PowerSchool is displaying.",
      "Check the student switcher in Chrome and run PowerSchool commands sequentially.",
    );
  }
};

async function openHome(page, config, allowLogin = false) {
  await page.goto(config.home);
  let state = await inspect(page, config);
  if (state?.kind === "guardian") return state;
  if (!allowLogin) {
    // Some districts serve a redirect or a sign-in message without the form.
    if (state?.kind === "unknown") {
      await page.goto(config.login);
      state = await inspect(page, config);
    }
    requireGuardian(state, config);
    return state;
  }

  await page.goto(config.login);
  state = await inspect(page, config);
  if (state?.kind === "guardian") return state;
  if (state?.kind !== "login" || !state.safeForm)
    throw auth(config, "No supported PowerSchool sign-in form was found.");
  if (!state.ready)
    throw auth(
      config,
      "Chrome has not autofilled both PowerSchool sign-in fields.",
    );
  await page.click("#btn-enter-sign-in");
  try {
    await page.wait({ selector: "#students-list, #btnLogout", timeout: 8 });
  } catch {
    // Verify below; never click Sign In twice if the first outcome is unclear.
  }
  state = await inspect(page, config);
  if (state?.kind !== "guardian")
    throw auth(config, "PowerSchool sign-in was not confirmed.");
  return state;
}

async function overview(page, config, requestedId) {
  let state = await openHome(page, config);
  requireOpen(state);
  if (
    requestedId &&
    !state.students.some((student) => student.studentId === requestedId)
  ) {
    throw new ArgumentError(
      "That student ID is not in this account's student list.",
      "Get an ID from `opencli powerschool students`.",
    );
  }
  const studentId = requestedId || state.studentId;
  if (requestedId && state.studentId !== requestedId) {
    const student = state.students.find(
      (entry) => entry.studentId === requestedId,
    );
    // Click only a listed portal control, never send a caller-supplied ID to an endpoint.
    await page.click(`#students-list a[href=${JSON.stringify(student.href)}]`);
    for (let attempt = 0; attempt < 10; attempt++) {
      state = await inspect(page, config, "overview");
      if (
        state?.kind !== "guardian" ||
        state.closed ||
        state.studentId === studentId
      )
        break;
      if (attempt < 9) await page.sleep(0.5);
    }
  } else {
    state = await inspect(page, config, "overview");
  }
  requireGuardian(state, config);
  requireOpen(state);
  requireStudent(state, studentId);
  if (!state.courses)
    throw new CommandExecutionError(
      "The PowerSchool class table was not recognized.",
    );
  return { studentId, courses: state.courses, hasTerms: state.hasTerms };
}

export async function run(page, command, args = {}, config = portalConfig()) {
  if (command === "login") {
    const state = await openHome(page, config, true);
    return [
      {
        signedIn: true,
        portalClosed: state.closed,
        studentCount: state.students.length,
      },
    ];
  }
  if (command === "students") {
    const state = await openHome(page, config);
    if (!state.students.length)
      throw new CommandExecutionError(
        "No supported student switcher was found.",
      );
    return state.students.map(({ studentId, name, selected }) => ({
      studentId,
      name,
      selected,
    }));
  }

  const { studentId, courses, hasTerms } = await overview(
    page,
    config,
    args.student,
  );
  if (command === "classes") {
    return courses.map(({ grades, ...course }) => ({ studentId, ...course }));
  }
  const chosen = args.class
    ? courses.filter((course) => course.classId === args.class)
    : courses;
  if (args.class && chosen.length !== 1) {
    throw new ArgumentError(
      "The class ID does not identify one class for this student.",
      "Get the class ID from `opencli powerschool classes` with the same --student.",
    );
  }
  const matchesTerm = (grade) =>
    !args.term || grade.term.toLowerCase() === args.term.toLowerCase();
  if (command === "grades") {
    if (!hasTerms)
      throw new CommandExecutionError(
        "No reporting-term columns were recognized.",
      );
    const rows = chosen.flatMap(({ classId, course, grades }) =>
      grades
        .filter(matchesTerm)
        .map(({ term, display, letter, percent, scoresUrl }) => ({
          studentId,
          classId,
          course,
          term,
          display,
          letter,
          percent,
          hasDetails: !!scoresUrl,
        })),
    );
    if (args.term && !rows.length && chosen.length) {
      throw new ArgumentError(
        "No reporting term matched --term.",
        "Run `opencli powerschool grades` without --term.",
      );
    }
    return rows;
  }
  if (command !== "assignments" || chosen.length !== 1 || !args.class)
    throw new ArgumentError("A class ID is required.");

  const [{ classId, course, teacher, grades }] = chosen;
  const details = grades.filter(
    (grade) => grade.scoresUrl && matchesTerm(grade),
  );
  if (details.length > 1)
    throw new ArgumentError(
      "This class has details for more than one term.",
      `Set --term to one of: ${details.map((grade) => grade.term).join(", ")}.`,
    );
  if (!details.length)
    throw new EmptyResultError(
      "powerschool assignments",
      "No assignment detail link is published for that class and term. See `powerschool grades` for terms with hasDetails: true.",
    );
  const [{ term, scoresUrl }] = details;
  const linkedParams = new URL(scoresUrl).searchParams;
  await page.goto(scoresUrl);
  for (let attempt = 0; attempt < 12; attempt++) {
    const state = await inspect(page, config, "assignments");
    requireGuardian(state, config);
    requireOpen(state);
    requireStudent(state, studentId);
    if (
      state.detail?.frn !== linkedParams.get("frn") ||
      state.detail?.term !== linkedParams.get("fg")
    ) {
      throw new CommandExecutionError(
        "PowerSchool did not display the requested class and term.",
      );
    }
    if (state.assignments) {
      return state.assignments.map((assignment) => ({
        studentId,
        classId,
        course,
        teacher,
        term,
        ...assignment,
      }));
    }
    // Newer score pages render the assignment grid after initial navigation.
    if (attempt < 11) await page.sleep(0.5);
  }
  throw new CommandExecutionError(
    "The assignment table did not load or was not recognized.",
    "Check the class's grade-detail page in Chrome. This district may use a different PowerSchool layout.",
  );
}
