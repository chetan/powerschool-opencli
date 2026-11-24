// OpenCLI serializes this function into Chrome. Keep helpers inside it.
export function inspectPortal(origin, surface) {
  if (location.origin !== origin) return { kind: "foreign" };

  const clean = (value) => (value ?? "").replace(/\s+/g, " ").trim();
  const text = (node) => clean(node?.textContent);
  const lines = (node) => {
    if (!node) return [];
    const copy = node.cloneNode(true);
    for (const br of copy.querySelectorAll("br")) br.replaceWith("\n");
    return copy.textContent.split("\n").map(clean).filter(Boolean);
  };
  const value = (s) => (!s || /^(?:[-–—.]+|n\/a)$/i.test(s) ? null : s);
  const number = (s) =>
    /^[+-]?\d+(?:\.\d+)?%?$/.test(s ?? "") ? Number(s.replace(/%$/, "")) : null;
  const pageLink = (anchor, file) => {
    if (!anchor) return null;
    const url = new URL(anchor.href);
    return url.origin === origin && url.pathname.endsWith(`/guardian/${file}`)
      ? url
      : null;
  };
  const login = document.querySelector("#btn-enter-sign-in");
  if (login) {
    const form = login.form;
    const ready = [
      form?.querySelector("#fieldAccount"),
      form?.querySelector("#fieldPassword"),
    ].every((field) => field && (field.matches(":autofill") || !!field.value));
    const safeForm =
      form?.method === "post" &&
      pageLink({ href: form.action }, "home.html") !== null;
    return { kind: "login", ready, safeForm };
  }

  const list = document.querySelector("#students-list");
  if (!list && !document.querySelector("#btnLogout"))
    return { kind: "unknown" };

  const students = [...(list?.querySelectorAll("li") ?? [])].flatMap((li) => {
    const anchor = li.querySelector("a");
    const href = anchor?.getAttribute("href");
    const match = href?.match(
      /^javascript: *switchStudent\( *(['"]?)(\d+)\1 *\) *;?$/i,
    );
    return match
      ? [
          {
            studentId: match[2],
            name: text(anchor),
            selected: li.classList.contains("selected"),
            href,
          },
        ]
      : [];
  });
  const selected = students.filter((student) => student.selected);
  const studentId = selected.length === 1 ? selected[0].studentId : null;
  const closed =
    location.pathname.endsWith("/home_school_access_disabled.html") ||
    [...document.querySelectorAll("h1,h2")].some((h) =>
      /portal (?:is )?closed/i.test(text(h)),
    );
  const state = { kind: "guardian", students, studentId, closed };
  if (closed || surface === "session") return state;

  // Expand header colspans and carry prior headers through rowspans. This
  // keeps the course and term columns aligned when attendance columns vary.
  const headerGrid = (rows) => {
    const grid = [];
    for (const [i, row] of rows.entries()) {
      grid[i] ??= [];
      let col = 0;
      for (const cell of row.cells) {
        while (grid[i][col] !== undefined) col++;
        for (let r = i; r < i + cell.rowSpan; r++) {
          grid[r] ??= [];
          for (let c = col; c < col + cell.colSpan; c++)
            grid[r][c] = text(cell);
        }
        col += cell.colSpan;
      }
    }
    return grid.at(-1) ?? [];
  };
  const headingRows = (table) => {
    const rows = [...table.rows];
    const first = rows.findIndex((row) =>
      [...row.cells].some((cell) => cell.tagName === "TH"),
    );
    if (first < 0) return [];
    const headers = [];
    for (const row of rows.slice(first)) {
      if (![...row.cells].some((cell) => cell.tagName === "TH")) break;
      headers.push(row);
    }
    return headers;
  };
  const column = (headers, re) => headers.findIndex((label) => re.test(label));

  if (surface === "overview") {
    const table = document.querySelector(
      "table#tblgrades, #quickLookup table.linkDescList",
    );
    if (!table) return state;
    const headers = headerGrid(headingRows(table));
    const courseIndex = column(headers, /^(?:course|class)(?: name)?$/i);
    const periodIndex = column(headers, /^(?:exp\.?|expression|period)$/i);
    if (courseIndex < 0) return state;
    const absencesIndex = column(headers, /^absences?$/i);
    const tardiesIndex = column(headers, /^(?:tardies|tardy)$/i);
    const end = Math.min(
      ...[absencesIndex, tardiesIndex, headers.length].filter(
        (i) => i > courseIndex,
      ),
    );
    const termColumns = headers
      .map((label, index) => ({ label, index }))
      .filter(
        ({ label, index }) =>
          index > courseIndex &&
          index < end &&
          label &&
          !/^(?:standards?(?: grades?)?|citizenship|attendance|comments?)$/i.test(
            label,
          ),
      );
    const rows = [...table.rows].filter((row) => {
      if (
        row.cells.length <= courseIndex ||
        [...row.cells].some((cell) => cell.tagName === "TH")
      )
        return false;
      return [...row.cells].every((cell) => cell.colSpan === 1);
    });
    state.courses = rows.flatMap((row, index) => {
      const cells = row.cells;
      const cell = cells[courseIndex];
      const course = value(lines(cell)[0]);
      if (!course) return [];
      const email = cell.querySelector('a[href^="mailto:" i]');
      const teacher = [...cell.querySelectorAll("a")].find((a) =>
        pageLink(a, "teacherinfo.html"),
      );
      const teacherName =
        [text(teacher), text(email)]
          .map((s) => s.replace(/^Email\s+/i, ""))
          .find((s) => s && !/^teacher info(?:rmation)?$/i.test(s)) ?? null;
      const room =
        text(cell).match(/\b(?:Rm\.?|Room)\s*:\s*([^\s]+)/i)?.[1] ?? null;
      const scores = (node) =>
        [...(node?.querySelectorAll("a") ?? [])]
          .map((a) => pageLink(a, "scores.html"))
          .find(Boolean);
      const grades = termColumns.map(({ label, index }) => {
        const link = scores(cells[index]);
        const parts = lines(cells[index]);
        const raw = value(parts.join(" "));
        // PowerSchool uses [ i ] as a detail link even when no grade is posted.
        const display = /^(?:\[\s*i\s*\]|not available)$/i.test(raw ?? "")
          ? null
          : raw;
        const split = display?.match(
          /^([A-Za-z][A-Za-z+-]*)\s+([+-]?\d+(?:\.\d+)?%?)$/,
        );
        return {
          term: link?.searchParams.get("fg") || label,
          display,
          letter:
            split?.[1] ??
            (/^[A-Za-z][A-Za-z+-]*$/.test(display ?? "") ? display : null),
          percent:
            parts.length === 2 && number(parts[0]) !== null
              ? number(parts[1])
              : number(split?.[2] ?? display),
          scoresUrl: link?.href ?? null,
        };
      });
      const firstDetail =
        scores(cell) ?? grades.find((grade) => grade.scoresUrl)?.scoresUrl;
      return [
        {
          classId:
            (firstDetail && new URL(firstDetail).searchParams.get("frn")) ||
            `row-${index + 1}`,
          course,
          teacher: teacherName,
          teacherEmail:
            email?.getAttribute("href").slice(7).split("?")[0] ?? null,
          room,
          period: value(text(cells[periodIndex])),
          absences: number(text(cells[absencesIndex])),
          tardies: number(text(cells[tardiesIndex])),
          grades,
        },
      ];
    });
    state.hasTerms = termColumns.length > 0;
    return state;
  }

  if (surface === "assignments") {
    state.detail = {
      frn: new URL(location.href).searchParams.get("frn"),
      term: new URL(location.href).searchParams.get("fg"),
    };
    const main = document.querySelector("#content-main") ?? document;
    const scope =
      main.querySelector("[data-pss-student-assignment-scores]") ?? main;
    const candidates = [...scope.querySelectorAll("table")];
    const table = candidates.find((t) =>
      headingRows(t).some(
        (row) =>
          [...row.cells].some((cell) =>
            /^(?:assignment(?: name)?|name)$/i.test(text(cell)),
          ) &&
          [...row.cells].some((cell) =>
            /^(?:score|points|%|percent(?:age)?|(?:letter )?grade)$/i.test(
              text(cell),
            ),
          ),
      ),
    );
    const empty = [...scope.querySelectorAll("td,p,div")].some((node) =>
      /^no (?:published )?(?:assignments|scores)(?:\s+(?:found|available|to display|have been posted))?[.!]?$/i.test(
        text(node),
      ),
    );
    if (!table) {
      if (empty) state.assignments = [];
      return state;
    }
    const headers = headerGrid(headingRows(table));
    const assignmentIndex = column(headers, /^(?:assignment(?: name)?|name)$/i);
    const dateIndex = column(headers, /^(?:date(?: due)?|due(?: date)?)$/i);
    const categoryIndex = column(headers, /^category$/i);
    const scoreIndex = column(headers, /^(?:score|points)$/i);
    const percentIndex = column(headers, /^(?:%|percent(?:age)?)$/i);
    const gradeIndex = column(headers, /^(?:letter(?: grade)?|grade)$/i);
    const flagColumns = headers.flatMap((label, index) =>
      /^(?:flags?|codes?|status)$/i.test(label) ? [index] : [],
    );
    const readFlag = (cell) => {
      if (!cell) return [];
      const visible = (node) =>
        !node.closest(".ng-hide,[hidden],[aria-hidden='true']");
      const icon = [...cell.querySelectorAll(".ps-icon,[role='img'],img")].find(
        visible,
      );
      const srLabel = cell.querySelector(".screen_readers_only");
      // In the Angular grid, an accessibility label is present even when the
      // conditional status icon is absent. Only report active flags.
      if (srLabel) return icon ? [text(srLabel)] : [];
      const labels = [...cell.querySelectorAll("[title],[aria-label],img[alt]")]
        .filter(visible)
        .map(
          (node) =>
            node.getAttribute("title") ||
            node.getAttribute("aria-label") ||
            node.getAttribute("alt"),
        );
      return [text(cell), ...labels];
    };
    const result = [...table.rows].flatMap((row) => {
      const cells = row.cells;
      if (
        assignmentIndex < 0 ||
        cells.length < 2 ||
        [...cells].some((cell) => cell.tagName === "TH")
      )
        return [];
      const nameCell = cells[assignmentIndex];
      const assignment =
        text(nameCell?.querySelector("a")) || lines(nameCell)[0];
      if (!assignment || /\{\{|\[\[/.test(assignment)) return [];
      const score = value(text(cells[scoreIndex]));
      const points = score?.split("/");
      const flags = [
        ...new Set(
          flagColumns
            .flatMap((index) => readFlag(cells[index]))
            .filter(Boolean),
        ),
      ];
      return [
        {
          assignment,
          dueDate: value(text(cells[dateIndex])),
          category: value(text(cells[categoryIndex])),
          score,
          pointsEarned: number(points?.[0]?.trim()),
          pointsPossible: number(points?.[1]?.trim()),
          percent: number(text(cells[percentIndex])),
          grade: value(text(cells[gradeIndex])),
          flags,
        },
      ];
    });
    if (result.length || empty) state.assignments = result;
    return state;
  }
  return state;
}
