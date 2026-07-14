(function attachReadXivExtension(root) {
  const ARXIV_PATTERN = /arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5})(?:v\d+)?(?:\.pdf)?(?:[/?#]|$)/i;

  function getArxivId(input) {
    if (typeof input !== 'string') return null;
    const match = input.match(ARXIV_PATTERN);
    return match ? match[1] : null;
  }

  function paperUrl(input) {
    const id = getArxivId(input);
    return id ? `https://arxiv.org/abs/${id}` : null;
  }

  function resultCopy(result) {
    if (result?.alreadyExists) {
      return {
        kind: 'exists',
        title: 'Already in your library',
        message: 'This paper has already been added.',
      };
    }

    return {
      kind: 'added',
      title: 'Added to ReadXiv',
      message: result?.loadingInBackground
        ? 'Saved. The PDF is downloading in the background.'
        : 'Saved to your library.',
    };
  }

  root.ReadXivExtension = { getArxivId, paperUrl, resultCopy };
})(typeof self !== 'undefined' ? self : globalThis);
