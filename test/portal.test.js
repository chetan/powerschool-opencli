import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { portalConfig, run } from "../lib/portal.js";

const config = portalConfig("https://school.example/public/");
const detail =
  "scores.html?frn=3001&begdate=08%2F20&enddate=10%2F31&fg=Q1&schoolid=2";
const signIn = `<form method="post" action="/guardian/home.html">
  <input id="fieldAccount" value="example"><input id="fieldPassword" type="password" value="fixture">
  <button id="btn-enter-sign-in">Sign in</button></form>`;
const guardian = (
  body,
  id = "11",
  names = ["Student One", "Student Two"],
) => `<ul id="students-list">
  <li class="${id === "11" ? "selected" : ""}"><a href="javascript:switchStudent(11);">${names[0]}</a></li>
  <li class="${id === "22" ? "selected" : ""}"><a href="javascript:switchStudent('22');">${names[1]}</a></li>
</ul><main id="content-main">${body}</main>`;
const overview = `<table id="tblgrades">
  <tr><th rowspan="2">Exp</th><th colspan="2">This Week</th><th rowspan="2">Course</th>
  <th rowspan="2">Q1</th><th rowspan="2">Q2</th><th rowspan="2">Absences</th><th rowspan="2">Tardies</th></tr>
  <tr><th>M</th><th>T</th></tr>
  <tr><td>3(A)</td><td></td><td></td><td>History<br><a href="mailto:teacher@example.org">Email A. Example</a>
  <span class="display-flex">- Rm: 34B</span></td>
  <td><a href="${detail}">A-<br>91.5</a></td><td>--</td><td>0</td><td>2</td></tr>
  <tr><td colspan="8">Attendance Totals</td></tr>
</table>`;
const detailWithoutDates = "scores.html?frn=3001&fg=Q2&schoolid=2";
const quickLookup = `<div id="quickLookup"><table class="linkDescList grid">
  <tr><th>Exp</th><th>Course</th><th>Q1</th><th>Q2</th><th>F1</th><th>Absences</th><th>Tardies</th></tr>
  <tr class="center"><td>3(A)</td><td>History<br>
    <a class="button mini dialogM" href="teacherinfo.html?frn=8000"></a>
    <a href="mailto:teacher@example.org">Email A. Example</a><span>- Rm: 34B</span></td>
    <td><a href="${detail}">93<br>93</a></td>
    <td><a href="${detailWithoutDates}">[ i ]</a></td><td>Not Available</td><td>0</td><td>2</td></tr>
  <tr><td colspan="5">Attendance Totals</td><td>0</td><td>2</td></tr>
</table><table class="center grid"><tr><th>Attendance By Day</th></tr></table></div>`;
const detailPage = `<div data-pss-student-assignment-scores><table class="grid">
  <tr><th>Due Date</th><th>Category</th><th>Assignment</th><th>Flags</th><th>Score</th><th>%</th><th>Grade</th></tr>
  <tr><td>10/3/2026</td><td>Projects</td><td><a>Map</a></td><td><img alt="Late"></td><td>0/20</td><td>0%</td><td>F</td></tr>
  <tr><td>10/7/2026</td><td>Practice</td><td>Reading</td><td><img title="Missing"></td><td>/10</td><td>--</td><td></td></tr>
</table></div>`;

function browser(options = {}) {
  let selected = options.selected ?? "11";
  let pendingStudent;
  let pendingOverview = false;
  let authed = !options.loggedOut;
  let url;
  let dom;
  const calls = [];
  const load = (nextUrl, html) => {
    dom?.window.close();
    url = nextUrl;
    dom = new JSDOM(html, { url, runScripts: "outside-only" });
  };
  const home = () => {
    if (!authed) return load(config.login, options.signInHtml ?? signIn);
    if (options.closed || options.closedStudent === selected)
      return load(
        new URL("home_school_access_disabled.html", config.home).href,
        guardian(
          "<h1>Portal Closed for PowerSchool Updating</h1>",
          selected,
          options.names,
        ),
      );
    load(
      config.home,
      guardian(
        pendingOverview ? "" : (options.overviewHtml ?? overview),
        selected,
        options.names,
      ),
    );
  };
  return {
    calls,
    close: () => dom?.window.close(),
    goto: async (next) => {
      calls.push(["goto", next]);
      if (next.includes("/scores.html?")) {
        const rendered = options.detailHtml ?? detailPage;
        return load(
          options.detailUrl ?? next,
          guardian(rendered, options.detailStudent ?? selected, options.names),
        );
      }
      home();
    },
    evaluate: async (fn, ...args) =>
      JSON.parse(
        JSON.stringify(
          dom.window.eval(`(${fn.toString()})(...${JSON.stringify(args)})`),
        ),
      ),
    click: async (selector) => {
      calls.push(["click", selector]);
      const link = dom.window.document.querySelector(selector);
      assert.ok(link, "The action targets a control on the page");
      if (selector === "#btn-enter-sign-in") {
        authed = !options.rejected;
        home();
      } else if (!options.switchFails) {
        pendingStudent = link.getAttribute("href").match(/\d+/)[0];
        if (!options.delayedSwitch) {
          selected = pendingStudent;
          pendingStudent = null;
          home();
        }
      }
    },
    wait: async () => {},
    sleep: async () => {
      if (pendingStudent) {
        selected = pendingStudent;
        pendingStudent = null;
        pendingOverview = options.delayedOverview;
        home();
      } else if (pendingOverview) {
        pendingOverview = false;
        home();
      }
    },
  };
}

test("portal URL is configurable, HTTPS-only, and cannot carry credentials", () => {
  assert.equal(
    portalConfig("https://other.example/sis/public/home.html").home,
    "https://other.example/sis/guardian/home.html",
  );
  assert.equal(
    portalConfig("https://other.example").login,
    "https://other.example/public/",
  );
  for (const invalid of [
    "",
    "http://other.example/public/",
    "https://u:p@other.example/public/",
    "https://other.example/public/?x=y",
    "https://other.example/admin/",
  ]) {
    assert.throws(() => portalConfig(invalid), /POWERSCHOOL_URL/);
  }
});

test("login clicks autofilled form once and students do not expose internal switch links", async (t) => {
  const page = browser({ loggedOut: true });
  t.after(page.close);
  assert.deepEqual(await run(page, "login", {}, config), [
    { signedIn: true, portalClosed: false, studentCount: 2 },
  ]);
  assert.deepEqual(await run(page, "students", {}, config), [
    { studentId: "11", name: "Student One", selected: true },
    { studentId: "22", name: "Student Two", selected: false },
  ]);
  assert.equal(page.calls.filter(([op]) => op === "click").length, 1);
});

test("missing autofill, cross-origin forms and rejected sign-ins fail without resubmitting", async (t) => {
  for (const [options, error, clicks] of [
    [
      { signInHtml: signIn.replace('value="fixture"', "") },
      /not autofilled/,
      0,
    ],
    [
      {
        signInHtml: signIn.replace(
          'action="/guardian',
          'action="https://elsewhere.example/guardian',
        ),
      },
      /No supported/,
      0,
    ],
    [{ rejected: true }, /not confirmed/, 1],
  ]) {
    const page = browser({ loggedOut: true, ...options });
    t.after(page.close);
    await assert.rejects(run(page, "login", {}, config), error);
    assert.equal(page.calls.filter(([op]) => op === "click").length, clicks);
  }
});

test("school closure allows login and student listing but stops reads for the closed school", async (t) => {
  const page = browser({ closed: true });
  t.after(page.close);
  assert.equal((await run(page, "login", {}, config))[0].portalClosed, true);
  assert.equal((await run(page, "students", {}, config)).length, 2);
  for (const command of ["classes", "grades", "assignments"]) {
    await assert.rejects(
      run(page, command, { student: "11", class: "3001" }, config),
      /closed for the selected student's school/,
    );
  }
  assert.ok(
    page.calls.every(([op, url]) => op === "goto" && url === config.home),
  );
});

test("classes, grades, and assignments accept a case-insensitive student name or ID", async (t) => {
  const page = browser({ names: ["Sam Example", "Example, Alex"] });
  t.after(page.close);
  assert.equal(
    (await run(page, "classes", { student: "alex" }, config))[0].studentId,
    "22",
  );
  assert.equal(
    (await run(page, "grades", { student: " ALEX  EXAMPLE " }, config))[0]
      .studentId,
    "22",
  );
  assert.equal(
    (
      await run(
        page,
        "assignments",
        { student: "example, alex", class: "3001" },
        config,
      )
    )[0].studentId,
    "22",
  );
  assert.equal(
    (await run(page, "classes", { student: "11" }, config))[0].studentId,
    "11",
  );
});

test("ambiguous or unknown names do not switch the selected student", async (t) => {
  const page = browser({ names: ["Alex", "Example, Alex"] });
  t.after(page.close);
  await assert.rejects(
    run(page, "grades", { student: "alex" }, config),
    /more than one student/,
  );
  await assert.rejects(
    run(page, "grades", { student: "ale" }, config),
    /No student with that name or ID/,
  );
  await assert.rejects(
    run(page, "grades", { student: " " }, config),
    /Provide a student name or ID/,
  );
  assert.equal(page.calls.filter(([op]) => op === "click").length, 0);
});

test("a closed school does not prevent switching to an open school or mislabel stale data", async (t) => {
  const page = browser({
    closedStudent: "11",
    delayedSwitch: true,
    delayedOverview: true,
  });
  t.after(page.close);
  assert.equal(
    (await run(page, "grades", { student: "22" }, config))[0].studentId,
    "22",
  );
  await assert.rejects(
    run(page, "grades", { student: "11" }, config),
    /closed for the selected student's school/,
  );
  assert.equal(page.calls.filter(([op]) => op === "click").length, 2);
});

test("quick lookup accepts numeric grades and ungraded terms with detail links", async (t) => {
  const page = browser({
    overviewHtml: quickLookup,
    detailHtml: "<p>No Assignments found.</p>",
  });
  t.after(page.close);
  const classes = await run(page, "classes", {}, config);
  assert.equal(classes.length, 1);
  assert.equal(classes[0].teacher, "A. Example");
  assert.equal(classes[0].room, "34B");
  const grades = await run(page, "grades", {}, config);
  assert.deepEqual(
    grades.map(({ term, display, letter, percent, hasDetails }) => [
      term,
      display,
      letter,
      percent,
      hasDetails,
    ]),
    [
      ["Q1", "93 93", null, 93, true],
      ["Q2", null, null, null, true],
      ["F1", null, null, null, false],
    ],
  );
  assert.deepEqual(
    await run(page, "assignments", { class: "3001", term: "Q2" }, config),
    [],
  );
  assert.deepEqual(page.calls.at(-1), [
    "goto",
    new URL(detailWithoutDates, config.home).href,
  ]);
});

test("assignment flag groups only report active indicators", async (t) => {
  const detailHtml = `<div data-pss-student-assignment-scores><table id="scoreTable">
    <tr><th>Due Date</th><th>Category</th><th>Assignment</th><th colspan="3">Flags</th><th>Score</th><th>%</th><th>Grade</th></tr>
    <tr><td>10/3/2026</td><td>Projects</td><td>Map</td>
      <td><span class="screen_readers_only">collected</span></td>
      <td><span class="screen_readers_only">late</span><div class="ps-icon" role="presentation"></div></td>
      <td><span class="screen_readers_only">missing</span><div class="ps-icon ng-hide"></div></td>
      <td>--/10</td><td></td><td></td></tr>
  </table></div>`;
  const page = browser({ detailHtml });
  t.after(page.close);
  const [row] = await run(
    page,
    "assignments",
    { class: "3001", term: "Q1" },
    config,
  );
  assert.deepEqual(row.flags, ["late"]);
  assert.equal(row.score, "--/10");
  assert.equal(row.pointsEarned, null);
  assert.equal(row.pointsPossible, 10);
});

test("class metadata and term grades align across header spans and preserve missing grades", async (t) => {
  const page = browser();
  t.after(page.close);
  assert.deepEqual(await run(page, "classes", { student: "22" }, config), [
    {
      studentId: "22",
      classId: "3001",
      course: "History",
      teacher: "A. Example",
      teacherEmail: "teacher@example.org",
      room: "34B",
      period: "3(A)",
      absences: 0,
      tardies: 2,
    },
  ]);
  assert.deepEqual(await run(page, "grades", { class: "3001" }, config), [
    {
      studentId: "22",
      classId: "3001",
      course: "History",
      term: "Q1",
      display: "A- 91.5",
      letter: "A-",
      percent: 91.5,
      hasDetails: true,
    },
    {
      studentId: "22",
      classId: "3001",
      course: "History",
      term: "Q2",
      display: null,
      letter: null,
      percent: null,
      hasDetails: false,
    },
  ]);
  assert.equal((await run(page, "grades", { term: "q1" }, config)).length, 1);
  await assert.rejects(
    run(page, "grades", { term: "T9" }, config),
    /No reporting term/,
  );
  await assert.rejects(
    run(page, "classes", { student: "999" }, config),
    /No student with that name or ID/,
  );
  assert.equal(page.calls.filter(([op]) => op === "click").length, 1);
});

test("grades filter by exact class ID or case-insensitive course substring", async (t) => {
  const courseRows = [
    ["3001", "LANGUAGE ARTS"],
    ["3002", "Applied Math"],
    ["3003", "Math Lab 3002"],
  ]
    .map(
      ([id, name]) =>
        `<tr><td>${name}</td><td><a href="${detail.replace("3001", id)}">A</a></td><td>--</td></tr>`,
    )
    .join("");
  const page = browser({
    overviewHtml: `<table id="tblgrades"><tr><th>Course</th><th>Q1</th><th>Q2</th></tr>${courseRows}</table>`,
  });
  t.after(page.close);
  const ids = async (filter) =>
    (await run(page, "grades", { class: filter, term: "Q1" }, config)).map(
      ({ classId }) => classId,
    );
  assert.deepEqual(await ids("lang"), ["3001"]);
  assert.deepEqual(await ids(" MATH "), ["3002", "3003"]);
  assert.deepEqual(await ids("3002"), ["3002"]);
  await assert.rejects(ids("music"), /No class matched/);
  await assert.rejects(ids(" "), /Provide a class name or ID/);
  await assert.rejects(
    run(page, "assignments", { class: "lang", term: "Q1" }, config),
    /class ID does not identify one class/,
  );
});

test("assignment scores follow the full portal link and distinguish zero and ungraded", async (t) => {
  const page = browser();
  t.after(page.close);
  const rows = await run(
    page,
    "assignments",
    { class: "3001", term: "Q1" },
    config,
  );
  assert.deepEqual(rows[0], {
    studentId: "11",
    classId: "3001",
    course: "History",
    teacher: "A. Example",
    term: "Q1",
    assignment: "Map",
    dueDate: "10/3/2026",
    category: "Projects",
    score: "0/20",
    pointsEarned: 0,
    pointsPossible: 20,
    percent: 0,
    grade: "F",
    flags: ["Late"],
  });
  assert.equal(rows[1].pointsEarned, null);
  assert.equal(rows[1].pointsPossible, 10);
  assert.deepEqual(rows[1].flags, ["Missing"]);
  assert.deepEqual(page.calls.at(-1), [
    "goto",
    new URL(detail, config.home).href,
  ]);
  await assert.rejects(
    run(page, "assignments", { class: "3001", term: "Q2" }, config),
    { code: "EMPTY_RESULT", hint: /no assignment detail link/i },
  );
});

test("assignment requests distinguish explicit empty states, unexpected layouts, and student or term changes", async (t) => {
  const args = { class: "3001", term: "Q1" };
  const empty = browser({ detailHtml: "<p>No assignments found.</p>" });
  t.after(empty.close);
  assert.deepEqual(await run(empty, "assignments", args, config), []);
  for (const [options, error] of [
    [
      { detailHtml: "<h1>Unexpected detail markup</h1>" },
      /assignment table did not load/,
    ],
    [{ detailStudent: "22" }, /Cannot verify which student/],
    [
      {
        detailUrl: new URL(detail.replace("fg=Q1", "fg=Q2"), config.home).href,
      },
      /requested class and term/,
    ],
  ]) {
    const page = browser(options);
    t.after(page.close);
    await assert.rejects(run(page, "assignments", args, config), error);
  }
  const stale = browser({ switchFails: true });
  t.after(stale.close);
  await assert.rejects(
    run(stale, "grades", { student: "22" }, config),
    /Cannot verify which student/,
  );
});
