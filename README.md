# PowerSchool for OpenCLI

List students, classes, reporting-term grades, and assignment scores from a PowerSchool guardian account. The plugin does not change grades or other school records.

## Install and sign in

Use OpenCLI 2.0.3 or later with its browser bridge connected to the Chrome profile where you saved your PowerSchool sign-in.

```sh
opencli plugin install "file://$PWD"
export POWERSCHOOL_URL='https://powerschool.example.org/public/'
opencli powerschool login
opencli powerschool students
```

Replace the example `POWERSCHOOL_URL` with your district's HTTPS sign-in URL. See `.env.example`. If you use a local `.env` file, export its variables before running OpenCLI; the plugin does not load it automatically.

`login` reuses a signed-in Chrome session. If it needs to sign in, it clicks the native Sign In button when Chrome has autofilled both fields. The plugin does not return, copy, or store the credentials. If Chrome or a password manager requires a gesture, or the district uses another sign-in flow, sign in manually in the connected Chrome profile and rerun `login`.

## Commands

```sh
opencli powerschool students
opencli powerschool classes --student STUDENT_ID -f table
opencli powerschool grades --student STUDENT_ID
opencli powerschool grades --student STUDENT_ID --term Q1
opencli powerschool grades --student STUDENT_ID --class CLASS_ID
opencli powerschool assignments CLASS_ID --student STUDENT_ID --term Q1
```

- `classes` shows courses, periods, teachers, teacher email and room when shown, and the attendance totals from the overview.
- `grades` shows the overall grade PowerSchool reports for each class and term. It does not recalculate grades or GPA. A blank grade is `null`, not zero. Use a row with `hasDetails: true` to find a class and term with an assignment detail link.
- `assignments` follows the portal's grade-detail link. It returns assignment names, due dates, categories, points, percentages, grades, and flags when shown in the table. If a class has links for several terms, specify `--term`.

Without `--student`, commands use the student currently selected in PowerSchool. A command with `--student` can change that selection in the browser session, so run PowerSchool commands sequentially. A closed district portal may still show the student list. In that case, class and grade reads stop with an error rather than returning empty records.

PowerSchool layouts can vary by district. Tests use synthetic HTML only.

## Development

Use Node.js 24 or later. From this directory, run `npm ci`, `npm run check` (syntax, formatting, and tests), or `npm run format`. The plugin ships as JavaScript; there is no bundle to build. Do not enable traces or save command output unless you have a private place for student records.
