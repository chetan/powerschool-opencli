import { cli, Strategy } from "@jackwener/opencli/registry";
import { portalConfig, run } from "./lib/portal.js";

let domain;
try {
  domain = new URL(portalConfig().origin).host;
} catch {
  // Discovery and help must still work before the portal is configured.
}

const student = {
  name: "student",
  type: "string",
  help: "Student name or ID from the students command (default: selected student)",
};
const term = {
  name: "term",
  type: "string",
  help: "Reporting term shown by grades, for example Q1",
};
const classFilter = {
  name: "class",
  type: "string",
  help: "Class ID from classes or grades",
};

for (const command of [
  {
    name: "login",
    access: "write",
    description:
      "Sign in to PowerSchool using Chrome autofill or an existing session",
    columns: ["signedIn", "portalClosed", "studentCount"],
    defaultWindowMode: "foreground",
  },
  {
    name: "students",
    access: "read",
    description: "List the students in the signed-in PowerSchool account",
    columns: ["studentId", "name", "selected"],
  },
  {
    name: "classes",
    access: "write",
    description:
      "List courses, periods, teachers, rooms, and attendance totals",
    args: [student],
    columns: [
      "studentId",
      "classId",
      "course",
      "teacher",
      "teacherEmail",
      "room",
      "period",
      "absences",
      "tardies",
    ],
  },
  {
    name: "grades",
    access: "write",
    description: "List PowerSchool's overall class grades by reporting term",
    args: [
      student,
      term,
      {
        ...classFilter,
        help: "Class ID or case-insensitive part of a course name",
      },
    ],
    columns: [
      "studentId",
      "classId",
      "course",
      "term",
      "display",
      "letter",
      "percent",
      "hasDetails",
    ],
  },
  {
    name: "assignments",
    access: "write",
    description:
      "List the assignment scores shown for one PowerSchool class and term",
    args: [{ ...classFilter, positional: true, required: true }, student, term],
    columns: [
      "studentId",
      "classId",
      "course",
      "teacher",
      "term",
      "assignment",
      "dueDate",
      "category",
      "score",
      "pointsEarned",
      "pointsPossible",
      "percent",
      "grade",
      "flags",
    ],
  },
]) {
  cli({
    site: "powerschool",
    domain,
    strategy: Strategy.UI,
    browser: true,
    navigateBefore: false,
    // PowerSchool's selected student is session state. Serialize commands that may change it.
    siteSession: "persistent",
    validateArgs: () => {
      portalConfig();
    },
    ...command,
    func: (page, args) => run(page, command.name, args),
  });
}
