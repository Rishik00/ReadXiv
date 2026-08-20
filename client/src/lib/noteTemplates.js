export function getPaperNoteTitle(paper) {
  return paper?.title || (paper?.id ? `arXiv:${paper.id}` : 'Untitled paper')
}

export function buildTitleOnlyNote(paper) {
  return `# ${getPaperNoteTitle(paper)}\n`
}

export const NOTE_TEMPLATES = [
  {
    id: 'none',
    label: 'None',
    build: buildTitleOnlyNote,
  },
  {
    id: 'paper-digest',
    label: 'Paper Digest',
    build: (paper) => `# ${getPaperNoteTitle(paper)}

## One-line takeaway

## Problem

## Core idea

## Method

## Results

## Limitations

## Useful quotes

## Follow-up questions
`,
  },
]
