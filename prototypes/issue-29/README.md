# Home command bar studies for issue #29

Run `node prototypes/issue-29/serve.mjs` from the repository root, then open
`http://localhost:8765/`. Set `PORT` to use another port.

These four standalone HTML pages keep the current monochrome visual direction
and the reading desk. They explore different entry points:

1. **Direct field:** free text searches the library; recognized IDs and URLs
   offer a paper review. Search, Open, Add, and Upload remain visible.
2. **Task workspace:** choose a task first, then use a focused field.
3. **Command palette:** open with the bar, `/`, or `Ctrl/Cmd+K`; navigate
   actions and paper matches with arrow keys and Enter.
4. **Paper composer:** paste multiple IDs or URLs into a review queue, or
   switch to library search.

This is a design review artifact. Paper data is illustrative, and actions show
prototype feedback rather than changing the library. The search and result
ideas can inform issue #3; the Open flow can inform issue #25.
