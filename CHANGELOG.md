# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2026-10-07

### Added

- Upload comparisons directly to slow.pics and comp.pics.
- Temporal alignment options in the Sources tab.
- Number-key shortcuts to switch the active source.
- Help button in the script editor header, and more guidance in the default user scripts.
- Frame size, picture type and frame rate shown on the preview.
- Resizable and hideable timeline and filmstrip, remembered between sessions.
- Source pre-warming after indexing, making seeking and source switching smoother.
- Button to scan forward for the next black/solid frame across all sources, with a configurable
  tolerance.
- Scale modes (match height, match width, or fit) chosen from dropdowns on the preview.
- Canvas modes on the preview: Fit, Native size, Fill width and Fill height.
- Fill mode and image position options for the preview, saved with the project.
- Setting to turn off update checks.

### Changed

- The script editor is merged into the Sources tab, which is now tabbed.
- The timeline is only shown on the Preview tab.
- Exporting now shows a progress state instead of a toast on completion.
- Update checks run at most once per day, and portable builds link straight to the portable
  executable.
- Portable executables in releases no longer have a `v` prefix in their filename.
- Scaling and crop/pad can be used at the same time, with crop/pad aspect based on the largest or
  smallest source.
- Pad/crop alignment is replaced by scale modes; each source renders at its own size and the
  preview lines them up.
- The Scaling settings tab is renamed to Algorithms, and scaling algorithms are named after
  VapourSynth kernels (Point, Bilinear, Bicubic, Lanczos, Spline36).
- The Preview Size setting is replaced by the preview's canvas-mode dropdown.
- Frame info and actions moved to the preview's bottom-right.
- Lowered the default minimum distance between comparison images to 2%.
- A frame buffer is always visible, even when the core is inactive.
- Status bar tidied up: no separators, and Hardware Device follows Decoder.

### Fixed

- Saving and loading of scripts to and from project files.
- The film strip no longer requests frames while collapsed or hidden.
- The preview border can no longer be set below 1px.

## [1.0.1] - 2026-08-13

### Added

- The full Dolby Vision profile and base layer compatability ID is now displayed
  in the info box.

### Changed

- Replaced the prev/next second controls with prev/next segment controls.
- Renamed the "Resolution" section under Sources to "Spatial alignment".
- Fullscreen is now automatically exited when a project is closed.
- Replaced all use of unsafe rust/FFI code, the backend is now all safe rust.

### Fixed

- Resolved rendering stall when closing the project or all sources, then using
  new ones without restarting the app.
- Long filenames no longer cause the dropdowns in Juxtapose mode to go all weird.
- The watermark now displays properly, with the full text visible, no clipping
  at the bottom edge.

## [1.0.0] - 2026-08-12

Initial release.

[Unreleased]: https://github.com/rlaphoenix/pear/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/rlaphoenix/pear/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/rlaphoenix/pear/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/rlaphoenix/pear/releases/tag/v1.0.0
