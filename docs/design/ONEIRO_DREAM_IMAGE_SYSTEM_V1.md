# Oneiro Dream Image System V1

Status: `oneiro-riso-dream-v1.3` deployed to CloudBase and live-health verified on 2026-07-22. Physical-device acceptance remains pending.

## Product Contract

Oneiro turns one dream into an original, independently shareable `3:4` portrait illustration. The user should recognize the main dream without seeing a checklist of every noun. The artwork must remain collectible as an image before the application adds title, date, emotion labels, keywords, or branding.

The stable visual identity is:

- high-saturation flat color blocks;
- rough screenprint / Risograph texture;
- deep hand-drawn contours with uneven pressure;
- slight ink misregistration and uneven coverage;
- simplified adult figures with minimal facial detail;
- asymmetric editorial dream-poster composition;
- one dominant event, one impossible rule, few supporting elements;
- dynamic emotion-led color rather than a fixed blue theme.

## Runtime Pipeline

```text
raw dream
  → interpretation extracts dream facts and visual_plan
  → server normalizes and limits visual elements
  → server selects emotion palette and composition mode
  → server compiles the final generation prompt
  → image provider generates text-free inner artwork
  → server validates binary format and 3:4 portrait geometry
  → original image + prompt + model + visual plan + QA record are stored
  → Mini Program Canvas adds title/date/tags/branding for export
```

## Structured Visual Plan

`interpretDream.result.visual_plan` contains:

- `raw_text`
- `main_event`
- `emotion` and `emotion_intensity`
- `setting`
- weighted `characters` and `objects`
- at most one `anomaly`
- `symbols` and user-confirmed `memory_elements`
- two to four `preserve_elements`
- at most one `hidden_symbol`
- one composition mode plus subject position, visual flow, spatial layers, and negative space

The image service re-normalizes this object from the owner-scoped stored dream. Client data is a fallback, not the primary source of truth.

## Element Budget

- one main event;
- zero or one reality-breaking rule;
- two to four preserved visual elements;
- zero or one hidden symbol;
- no more than seven recognizable items in the planned image.

Selection priority:

```text
main event > anomaly > emotion-bearing detail > repeated/personal detail > ordinary environment
```

The prompt explicitly forbids inventing decorative occult motifs and instructs the model to condense the dream rather than illustrate every noun.

## Dynamic Palettes

The server maps dream wording and structured emotions to one of seven palette families:

- anxiety
- nostalgia
- excitement
- sadness
- anger
- mystery
- healing

Each family resolves to one dominant ink, one accent ink, one or two auxiliary inks, one near-black contour ink, and one paper color. The final prompt permits exactly four to six inks and rejects uniform-blue, generic-purple, rainbow, and muddy grey-brown treatments.

## Composition Variation

The supported modes are:

- `off_center_diagonal`
- `threshold_depth`
- `cropped_closeup`
- `split_distance`
- `low_horizon`
- `vertical_drift`

When the interpretation does not provide a valid mode, the server chooses one deterministically from the current dream instead of falling back to a single centered template. Every mode keeps one focal path and roughly `35%–50%` low-density breathing space.

## Generation Contract

The image provider receives only the inner artwork request. It must not generate:

- a tarot/card border, title, number, frame, logo, or watermark;
- photorealism, 3D, gradients, glossy light, or detailed faces;
- perfect vector geometry or repeated sketch contours;
- symmetrical centered templates;
- unrelated symbols, plants, decorative sparkles, or visual clutter.

The stable server-side style version is `oneiro-riso-dream-v1.3`.

## Storage And Post-processing

`generated_assets` stores the owner, source dream, original bitmap file ID, full compiled generation prompt, prompt preview, model, style version, normalized visual plan, image format/size, and quality-check record.

Chinese title, date, emotion labels, user keywords, and the Oneiro brand stamp remain Canvas post-processing responsibilities. They are never delegated to the image model.

## Quality Checks

Implemented deterministic checks:

1. planned `3:4` portrait format;
2. main event presence;
3. anomaly, preserved-element, recognizable-element, and hidden-symbol limits;
4. four-to-six-color palette contract;
5. asymmetric composition and breathing-space plan;
6. actual PNG/JPEG/WebP dimensions are readable;
7. actual image is portrait and within tolerance of `3:4`.

The following checks are recorded as `requires_vision_review`, not falsely marked as passed:

- text or gibberish in pixels;
- focal-point clarity;
- visible main event;
- unrelated generated elements;
- excessive facial detail;
- actual saturation;
- gradient or 3D appearance;
- density contrast;
- thumbnail readability.

A later production phase can add a vision-model review and controlled regeneration loop. Until then, these semantic checks require sample review during the nine-card stability test.
