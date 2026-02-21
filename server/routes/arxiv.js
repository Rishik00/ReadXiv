import express from 'express';
import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { getDB, saveDB, PAPYRUS_DIR } from '../db.js';

const router = express.Router();

// Extract arxiv ID from URL or string
function extractArxivId(input) {
  // Match arxiv.org URLs
  const urlMatch = input.match(/arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5})(?:v\d+)?/);
  if (urlMatch) return urlMatch[1];
  
  // Match bare arxiv ID (e.g., 2301.07041)
  const idMatch = input.match(/^(\d{4}\.\d{4,5})(?:v\d+)?$/);
  if (idMatch) return idMatch[1];
  
  return null;
}

// Fetch paper metadata from arxiv API
async function fetchArxivMetadata(arxivId) {
  try {
    const response = await axios.get(`http://export.arxiv.org/api/query?id_list=${arxivId}`, {
      headers: { 'Accept': 'application/atom+xml' }
    });
    
    // Parse XML response (simplified - in production use proper XML parser)
    const xml = response.data;
    
    // Extract title (skip the feed title, get the entry title)
    const entryMatch = xml.match(/<entry>([\s\S]*?)<\/entry>/);
    if (!entryMatch) {
      throw new Error('No entry found in arxiv response');
    }
    
    const entry = entryMatch[1];
    const titleMatch = entry.match(/<title>(.*?)<\/title>/s);
    const summaryMatch = entry.match(/<summary>(.*?)<\/summary>/s);
    const authorMatches = entry.match(/<author>[\s\S]*?<name>(.*?)<\/name>[\s\S]*?<\/author>/g) || [];
    const publishedMatch = entry.match(/<published>(.*?)<\/published>/);
    
    const title = titleMatch 
      ? titleMatch[1].replace(/^\s*|\s*$/g, '').replace(/\s+/g, ' ').trim()
      : `arXiv:${arxivId}`;
    const abstract = summaryMatch 
      ? summaryMatch[1].replace(/^\s*|\s*$/g, '').replace(/\s+/g, ' ').trim()
      : '';
    const authors = authorMatches.length > 0
      ? authorMatches.map(m => {
          const nameMatch = m.match(/<name>(.*?)<\/name>/);
          return nameMatch ? nameMatch[1].trim() : '';
        }).filter(Boolean).join(', ')
      : 'Unknown';
    const published = publishedMatch ? publishedMatch[1] : '';
    const year = published ? new Date(published).getFullYear() : null;
    
    return { title, authors, abstract, year, arxivId };
  } catch (error) {
    console.error('Error fetching arxiv metadata:', error);
    throw new Error(`Failed to fetch arxiv metadata: ${error.message}`);
  }
}

// Download PDF from arxiv
async function downloadPDF(arxivId) {
  const pdfUrl = `https://arxiv.org/pdf/${arxivId}.pdf`;
  const pdfPath = path.join(PAPYRUS_DIR, 'pdfs', `${arxivId}.pdf`);
  
  const response = await axios.get(pdfUrl, { responseType: 'arraybuffer' });
  await fs.writeFile(pdfPath, response.data);
  
  return { pdfPath, pdfUrl };
}

function rowToObject(row, columns) {
  const obj = {};
  columns.forEach((col, i) => {
    obj[col] = row[i];
  });
  return obj;
}

// Add paper from arxiv URL/ID
router.post('/add', async (req, res) => {
  try {
    const { input } = req.body;
    
    if (!input || !input.trim()) {
      return res.status(400).json({ error: 'Input required' });
    }
    
    const arxivId = extractArxivId(input.trim());
    if (!arxivId) {
      return res.status(400).json({ error: 'Invalid arxiv URL or ID' });
    }
    
    const database = await getDB();
    
    // Check if paper already exists
    const existingResult = database.exec('SELECT * FROM papers WHERE id = ?', [arxivId]);
    if (existingResult.length > 0 && existingResult[0].values.length > 0) {
      const columns = existingResult[0].columns;
      const existing = Object.fromEntries(columns.map((col, i) => [col, existingResult[0].values[0][i]]));
      return res.json({ ...existing, alreadyExists: true });
    }
    
    // Fetch metadata
    const metadata = await fetchArxivMetadata(arxivId);
    
    // Create notes file
    const notesPath = path.join(PAPYRUS_DIR, 'notes', `${arxivId}.md`);
    await fs.writeFile(notesPath, `# ${metadata.title}\n\n${metadata.authors}\n\n`);
    
    // Insert lightweight paper shell first so UI can transition immediately.
    const now = new Date().toISOString();
    const plannedPdfPath = path.join(PAPYRUS_DIR, 'pdfs', `${arxivId}.pdf`);
    const plannedPdfUrl = `https://arxiv.org/pdf/${arxivId}.pdf`;
    
    database.run(`
      INSERT INTO papers (id, title, authors, abstract, url, pdf_path, pdf_url, source, year, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'arxiv', ?, 'loading', ?, ?)
    `, [
      arxivId,
      metadata.title,
      metadata.authors,
      metadata.abstract,
      `https://arxiv.org/abs/${arxivId}`,
      plannedPdfPath,
      plannedPdfUrl,
      metadata.year,
      now,
      now
    ]);
    
    saveDB();

    const result = database.exec('SELECT * FROM papers WHERE id = ?', [arxivId]);
    const paper = rowToObject(result[0].values[0], result[0].columns);

    // Fire-and-forget download in the background.
    void (async () => {
      try {
        const { pdfPath, pdfUrl } = await downloadPDF(arxivId);
        const db = await getDB();
        db.run(
          "UPDATE papers SET pdf_path = ?, pdf_url = ?, status = 'queued', updated_at = datetime('now') WHERE id = ?",
          [pdfPath, pdfUrl, arxivId]
        );
        saveDB();
      } catch (downloadError) {
        const db = await getDB();
        db.run(
          "UPDATE papers SET status = 'error', updated_at = datetime('now') WHERE id = ?",
          [arxivId]
        );
        saveDB();
        console.error('Background PDF download failed:', downloadError);
      }
    })();

    res.status(202).json({ ...paper, loadingInBackground: true });
  } catch (error) {
    console.error('Error adding paper:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
