export function getPaperNoteTitle(paper) {
  return paper?.title || (paper?.id ? `arXiv:${paper.id}` : 'Untitled paper');
}

export function buildPaperDigestNotes(paper) {
  return `# ${getPaperNoteTitle(paper)}

## One-line takeaway

## Problem

## Core idea

## Method

## Results

## Limitations

## Useful quotes

## Follow-up questions
`;
}
