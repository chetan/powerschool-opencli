# PowerSchool for OpenCLI

List students, classes, reporting-term grades, and assignment scores from a PowerSchool guardian account. The plugin does not change grades or other school records.

## Install and sign in

Use OpenCLI 2.0.3 or later with its browser bridge connected to the Chrome profile where you saved your PowerSchool sign-in.

From the root of this repository, run:

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
opencli powerschool classes --student alex -f table
opencli powerschool grades --student alex
opencli powerschool grades --student alex --term Q1
opencli powerschool grades --student "Alex Example" --class CLASS_ID
opencli powerschool assignments CLASS_ID --student alex --term Q1
```

- `classes` shows courses, periods, teachers, teacher email and room when shown, and the attendance totals from the overview.
- `grades` shows the overall grade PowerSchool reports for each class and term. It does not recalculate grades or GPA. A blank grade is `null`, not zero. Use a row with `hasDetails: true` to find a class and term with an assignment detail link.
- `assignments` follows the portal's grade-detail link. It returns assignment names, due dates, categories, points, percentages, grades, and flags when shown in the table. If a class has links for several terms, specify `--term`.

`--student` accepts a case-insensitive full name, a unique single name (such as a first name), or an ID from `students`. Quote names with spaces. If a name matches more than one student, use the full name or ID.

Without `--student`, commands use the student currently selected in PowerSchool. A command with `--student` can change that selection in the browser session, so run PowerSchool commands sequentially. If one school closes its portal, you can still use `--student` to select a linked student at an open school. Reads for the closed school report an error, not empty grades. The `portalClosed` field from `login` describes the currently selected student's school.

PowerSchool layouts can vary by district. Tests use synthetic HTML only.

## Development

For Bun development (tested with Bun 1.4.5), run `bun install --frozen-lockfile --ignore-scripts` and `bun test`. For npm, use Node.js 24 or later and run `npm ci --ignore-scripts` and `npm run check` (syntax, formatting, and tests). Use `npm run format` to format the source.

Keep `package-lock.json` as the source for both lockfiles. When dependencies change, update the npm lock first. Copy `package.json` and `package-lock.json` to a temporary directory without a `bun.lock`, run `bun pm migrate` there, and copy the resulting `bun.lock` back. Bun imports the npm lock but cannot export one.

The plugin ships as JavaScript; there is no bundle to build. Do not enable traces or save command output unless you have a private place for student records.
