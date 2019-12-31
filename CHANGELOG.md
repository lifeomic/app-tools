# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.2] - 2019-12-31
### Changed
- Bumped client-oauth2 library to include less strict/unnecessary validation on
redirectUri + post-auth pathname matching. This allows for intermediary
redirects in the authorize flow.

## [2.0.0] - 2019-12-26
### Breaking
- Switch to base64 encoding to improve state query param parsing consistency
  [#13](https://github.com/lifeomic/app-tools/pull/13). This is unlikely to
  affect most consumers.
