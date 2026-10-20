# Phase 2.1 dependency audit

Fresh npm audit results from the current backend and frontend lockfiles. No automatic or forced upgrades were applied. Counts include transitive and development packages and do not establish exploitability. Raw advisory data and every reported node_modules path are in backend.json/frontend.json; summary.json adds installed versions and representative root dependency chains.

| Scope | Critical | High | Moderate | Low | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| backend | 2 | 18 | 5 | 1 | 26 |
| frontend | 3 | 78 | 19 | 5 | 105 |

## Critical and directly affected dependencies

| Scope | Package | Severity | Representative chain |
| --- | --- | --- | --- |
| backend | mongoose | moderate | mongoose |
| backend | nodemailer | high | nodemailer |
| backend | nodemon | high | nodemon |
| backend | prisma | high | prisma |
| backend | protobufjs | critical | @google-cloud/vision > google-gax > protobufjs |
| backend | proxy-addr | critical | express > proxy-addr |
| backend | uuid | moderate | uuid |
| frontend | axios | high | axios |
| frontend | proxy-addr | critical | react-scripts > webpack-dev-server > express > proxy-addr |
| frontend | react-router-dom | moderate | react-router-dom |
| frontend | react-scripts | high | react-scripts |
| frontend | shell-quote | critical | react-scripts > react-dev-utils > shell-quote |
| frontend | websocket-driver | critical | react-scripts > webpack-dev-server > sockjs > websocket-driver |

The backend findings include production Express/protobuf/mail/database dependencies and Prisma/nodemon tooling. Frontend findings include runtime Axios/router dependencies and the CRA development/build graph. Review advisory details, actual call paths, and compatible remediations before deployment; this infrastructure phase does not declare these packages safe or implement authentication remediation.
