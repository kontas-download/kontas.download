[Lietuvių](CONTRIBUTING.md) | [Русский](CONTRIBUTING.ru.md) | [English](CONTRIBUTING.en.md)

# Contributing to kontas.download

Thank you for wanting to help. The program is used under the [LICENSE](LICENSE): free to use, not to be redistributed. This document explains how to take part so that everyone is clear about rights.

## Bug reports and suggestions

Report bugs and suggest improvements in the project's issue tracker (the link will be given on the project website https://kontas.download; for now write to contact@kontas.download). Include: the program version (the `version` field in `web/package.json`), what you did, what you expected and what you got. Never send real accounting data, passwords or SMTP keys: made-up examples are enough.

For vulnerabilities see [web/SECURITY.md](web/SECURITY.md): do not report them publicly.

## Code changes

Code changes (pull requests) are **not accepted yet**, because the project does not have an agreement about rights to contributed code. Describe your suggestions in the issue tracker: it is the fastest way for them to reach the program.

When a contributor agreement (CLA) is adopted, this text will be extended. Its main terms will be:
- by sending a change you confirm that you are its author and entitled to send it;
- you grant the rights holder a perpetual, royalty-free right to use, modify and distribute your change as part of the project under the project licence and its later versions;
- your authorship is credited in the change log if you wish.

## Languages

The main language of the project is Lithuanian. Documents have a Lithuanian main text plus Russian and English versions; when you change one version, update the others. Code comments and text keys are written in English, user-visible texts in Lithuanian, Russian and English (see `web/src/lib/i18n`).

## Requirements for changes (once they are accepted)

- The change has a test (`cd web && npm test`), and `npx tsc --noEmit` and `npx eslint` report no errors.
- Database changes are additive only: a new migration with a new version; already released migrations must not be edited.
- Nothing that sends data outside without an explicit user action.
- Tax calculations cite an official source (the law, a VMI description).
