# Changelog

All notable changes to Big Dill Pickleball are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Champion banner in the Matches and Bracket page headers. Each division's
  champions appear in the banner as soon as that division's Final is scored,
  with the runner-up and third place shown on larger screens.

### Changed

- "Reset Playoffs" is now two buttons, "Reset ADV Playoffs" and
  "Reset BI Playoffs". Each one clears only its own division's semifinals
  and finals.
- The "Tournament Complete" notice on the Matches page is replaced by the
  champion banner, which notes when scores are locked.

### Fixed

- Finishing one division's finals no longer locks score entry for the other
  division. Round robin and semifinal scores now lock per division, so both
  divisions can play through to their own finals independently.
