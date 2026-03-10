# Hero Scenario: The Hound of the Baskervilles

This document is the reference script for a non-live hero replay on the landing page.

The hero should not make any API calls. It should replay a scripted sequence that looks like the real product:

1. The reader shows a passage from the book.
2. The user highlights a sentence.
3. The cursor moves to the `Explain selection` button and clicks it.
4. The AI pane opens or becomes active.
5. A user bubble appears with `Explain selection`.
6. The assistant response streams in chunk by chunk.

## Scenario goal

Demonstrate the fastest, clearest Minerva use case:

- select difficult or atmospheric text
- get an immediate explanation in context

This should feel grounded, literary, and easy to understand in under 10 seconds.

## Book choice

- Book: `The Hound of the Baskervilles`
- Author: `Arthur Conan Doyle`
- Chapter: `VI. Baskerville Hall`
- Scenario type: `Quick mode / Explain selection`

## Why this passage

This passage is strong for the hero because it is:

- visually atmospheric
- slightly old-fashioned in phrasing
- understandable even without much plot setup
- short enough to highlight cleanly in the mock EPUB
- easy for the AI to explain in a way that feels useful immediately

## Source passage

Use this excerpt in the mocked EPUB view.

> Over the green squares of the fields and the low curve of a wood there rose in the distance a gray, melancholy hill, with a strange jagged summit, dim and vague in the distance, like some fantastic landscape in a dream.

## Selected text

This is the exact text the user should highlight in the hero replay:

> a gray, melancholy hill, with a strange jagged summit, dim and vague in the distance, like some fantastic landscape in a dream

This selection is better than highlighting the full sentence because:

- it is visually compact
- it centers the mood-heavy language
- it makes the explanation feel interpretive rather than mechanical

## Product message this slide should communicate

Plain-language takeaway for the viewer:

`Highlight any passage and Minerva explains what it means and why it matters.`

## Suggested visible UI copy

- Slide label: `Explain selection`
- Book title in reader chrome: `The Hound of the Baskervilles`
- Chapter label: `Chapter VI - Baskerville Hall`
- Button label: `Explain selection`
- User bubble text: `Explain selection`

Optional small caption under the hero:

`Instant explanations, grounded in the exact passage you selected.`

## Mock EPUB layout guidance

The reader should look real, but it does not need to be a real EPUB renderer.

Recommended structure:

- top bar with book title and chapter
- page body with 1 to 2 paragraphs
- highlighted selection with a warm paper-like highlight color
- an `Explain selection` button in the reader toolbar

Keep the page calm and readable. The highlight should be the main focal point before the click.

## Mock EPUB text block

Use this text block for the visible page:

> "I've been over a good part of the world since I left it, Dr. Watson," said he; "but I have never seen a place to compare with it."
>
> "I never saw a Devonshire man who did not swear by his county," I remarked.
>
> Over the green squares of the fields and the low curve of a wood there rose in the distance a gray, melancholy hill, with a strange jagged summit, dim and vague in the distance, like some fantastic landscape in a dream. Baskerville sat for a long time, his eyes fixed upon it, and I read upon his eager face how much it meant to him, this first sight of that strange spot where the men of his blood had held sway so long and left their mark so deep.

## Visual treatment of the selection

Highlight only this fragment:

> a gray, melancholy hill, with a strange jagged summit, dim and vague in the distance, like some fantastic landscape in a dream

Recommended treatment:

- soft amber or pale gold highlight
- preserve readable dark text over the highlight
- slight rounded corners on the highlight spans
- animate the highlight appearing from left to right over 500 to 800 ms

## Replay timeline

These timings are suggestions. They can be tuned once the hero is implemented.

### Phase 1: idle reader

- `0ms`: slide appears with the EPUB mock already visible
- `0ms`: AI pane is visible but empty or in quiet idle state
- `400ms`: cursor enters the reading area

### Phase 2: text selection

- `700ms`: cursor drag begins at the start of the selected phrase
- `1500ms`: highlighted text finishes rendering
- `1700ms`: slight pause so the user can register the selected text

### Phase 3: explain action

- `1900ms`: cursor moves toward the `Explain selection` button
- `2500ms`: hover state on button
- `2750ms`: button click
- `2900ms`: AI pane becomes active

### Phase 4: chat replay

- `3200ms`: user bubble appears with `Explain selection`
- `3600ms`: assistant typing indicator appears
- `4200ms`: assistant begins streaming response
- `7800ms`: response finishes
- `9000ms`: hold final frame before slide advances or loops

## Assistant response

The response should be short, helpful, and visibly grounded in the selected line.

Final assembled answer:

> Doyle is using this description to make the moor feel eerie and unreal before the characters even arrive. Words like "gray," "melancholy," "jagged," and "dim and vague" turn the landscape into something emotionally threatening, not just physically distant. The comparison to "some fantastic landscape in a dream" suggests that the place feels uncanny and half-unreal, which prepares the reader for the mystery and dread surrounding Baskerville Hall.

## Streaming chunks

Use these chunks for the hero replay. The chunking should feel natural, not too mechanical.

1. `Doyle is using this description to make the moor feel eerie and unreal before the characters even arrive. `
2. `Words like "gray," "melancholy," "jagged," and "dim and vague" turn the landscape into something emotionally threatening, not just physically distant. `
3. `The comparison to "some fantastic landscape in a dream" suggests that the place feels uncanny and half-unreal, `
4. `which prepares the reader for the mystery and dread surrounding Baskerville Hall.`

## Optional richer version

If the hero supports a slightly longer answer, this variant also works:

> Holmes and Watson are not just approaching a new setting; Doyle is turning the landscape itself into part of the threat. The moor is described as sad, jagged, dreamlike, and indistinct, which makes it feel mysterious before anything supernatural has even happened. That mood matters because the novel often builds fear through atmosphere first, then plot.

## Suggested cursor behavior

To make the replay feel believable:

- use a normal pointer cursor, not an oversized demo cursor
- drag smoothly across the line rather than snapping to a preselected state
- add a short pause after the selection completes
- move with a slight curve toward the button instead of a perfectly straight robotic line
- keep the click animation subtle

## AI pane behavior

The AI pane should mirror the product without reproducing the full production UI.

Recommended visible states:

- header visible
- user bubble appears instantly after click
- brief typing/loading state
- assistant message streams linearly

Do not show tool calls in this scenario. This slide is about instant explanation, not deep research.

## What not to do

- do not call the real backend
- do not stream random text with different wording on each render
- do not make the response too long
- do not make the cursor movement overly theatrical
- do not highlight too much text
- do not use a passage that requires heavy prior plot knowledge

## Implementation note

The hero should treat this as a scripted scenario object, not a live chat.

Recommended shape:

```ts
{
  id: "hound-explain-selection",
  label: "Explain selection",
  bookTitle: "The Hound of the Baskervilles",
  chapterTitle: "Chapter VI - Baskerville Hall",
  selectedText: "a gray, melancholy hill, with a strange jagged summit, dim and vague in the distance, like some fantastic landscape in a dream",
  userMessage: "Explain selection",
  responseChunks: [
    "Doyle is using this description to make the moor feel eerie and unreal before the characters even arrive. ",
    "Words like \"gray,\" \"melancholy,\" \"jagged,\" and \"dim and vague\" turn the landscape into something emotionally threatening, not just physically distant. ",
    "The comparison to \"some fantastic landscape in a dream\" suggests that the place feels uncanny and half-unreal, ",
    "which prepares the reader for the mystery and dread surrounding Baskerville Hall."
  ]
}
```

## Success criteria

The slide is successful if a new visitor can understand all of this almost instantly:

- this is a book-reading product
- the user can select text directly in the reading view
- Minerva explains difficult passages immediately
- the explanation feels smart, contextual, and grounded in the exact quote
