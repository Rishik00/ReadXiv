import fs from 'fs-extra';
import path from 'path';
import { PROJECTS_DIR } from '../utils/paths.mjs';

function sanitizeProjectName(input) {
  return input.trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').replace(/\s+/g, '-');
}

export async function startProjectCommand(projectName) {
  if (!projectName || !projectName.trim()) {
    throw new Error('Missing project name. Usage: readxiv start_project:<project_name>');
  }

  const safeName = sanitizeProjectName(projectName);
  const projectDir = path.join(PROJECTS_DIR, safeName);
  const manifestPath = path.join(projectDir, 'project.json');
  const notesPath = path.join(projectDir, 'README.md');

  await fs.ensureDir(projectDir);

  const manifest = {
    name: projectName.trim(),
    slug: safeName,
    createdAt: new Date().toISOString(),
    status: 'active',
    notes: 'Initial scaffold. Project model can be extended once the detailed vision is defined.',
  };

  await fs.writeJson(manifestPath, manifest, { spaces: 2 });
  if (!(await fs.pathExists(notesPath))) {
    await fs.writeFile(notesPath, `# ${projectName.trim()}\n\nProject notes.\n`, 'utf8');
  }

  console.log(`Project created: ${projectName.trim()}`);
  console.log(`Path: ${projectDir}`);
}
