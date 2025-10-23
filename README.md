# Repo → Text Converter

Convert any Git repository (public or private) into structured text files perfect for AI/LLM ingestion.

🚀 **[Try it live](http://localhost:3000)** (or deploy to Vercel)

## Features

✅ **Multi-Platform Support**
- GitHub (public & private)
- GitLab
- Bitbucket

✅ **Smart File Filtering**
- Includes common source code extensions (js, ts, py, java, go, rust, etc.)
- Skips binaries, large files (>2MB), and build artifacts
- Ignores `node_modules`, `.git`, `dist`, and other common directories

✅ **Flexible Output Formats**
- **combined.txt** - All files concatenated with clear separators
- **separated/** folder - Individual .txt files with path-encoded names (optional)
- **manifest.json** - Metadata about the conversion

✅ **Private Repository Support**
- GitHub Personal Access Token authentication
- Support for organization-owned repositories
- Works with both classic and fine-grained tokens

✅ **Modern UX**
- Native "Save As" dialog (Chromium browsers)
- Smart filename defaults (uses repo name)
- Automatic fallback for older browsers

## Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

### Public Repositories

1. Paste the repository URL (e.g., `https://github.com/vercel/next.js`)
2. Optionally specify a branch/ref
3. Click "Convert & Download ZIP"

### Private Repositories

1. Create a GitHub Personal Access Token:
   - [Classic token](https://github.com/settings/tokens/new?scopes=repo&description=Repo%20to%20Text%20Converter) with `repo` scope
   - [Fine-grained token](https://github.com/settings/personal-access-tokens/new) with repository access
2. Paste the token in the "GitHub Token" field
3. Enter your private repo URL
4. Click "Convert & Download ZIP"

**Note:** For organization repos, ensure your token has access to that organization.

## Output Structure

### With Separated Files (Default)

```
vercel-next.js.zip
├── vercel-next.js-main-combined.txt   # All files concatenated
├── manifest.json                       # Conversion metadata
└── separated/                          # Individual files
    ├── README.md.txt
    ├── src__app__page.tsx.txt
    ├── src__components__Button.tsx.txt
    └── ...
```

### Without Separated Files

```
vercel-next.js.zip
├── vercel-next.js-main-combined.txt   # All files concatenated
└── manifest.json                       # Conversion metadata
```

## Example Output

### owner-repo-main-combined.txt
```
----- BEGIN FILE: README.md -----
# My Project
...
----- END FILE: README.md -----

----- BEGIN FILE: src/index.ts -----
import express from 'express';
...
----- END FILE: src/index.ts -----
```

### manifest.json
```json
{
  "repoUrl": "https://github.com/owner/repo",
  "ref": "main",
  "includedFiles": 247,
  "includeSeparated": true,
  "combinedFilename": "owner-repo-main-combined.txt",
  "filters": {
    "maxFileBytes": 2097152,
    "ignorePrefixes": ["node_modules/", ".git/", "dist/", ...],
    "allowedExts": ["js", "ts", "py", "md", ...]
  },
  "generatedAt": "2025-10-22T14:35:12.723Z"
}
```

## Configuration

### Modify Filters

Edit `src/app/api/convert/route.ts`:

```typescript
const MAX_FILE_BYTES = 2 * 1024 * 1024; // Adjust file size limit

const IGNORE_DIR_PREFIXES = [
  "node_modules/",
  ".git/",
  // Add your own patterns
];

const ALLOWED_EXTS = new Set([
  "js", "jsx", "ts", "tsx",
  // Add your own extensions
]);
```

## Security Notes

- GitHub tokens are sent directly from your browser to GitHub's API
- Tokens are **never logged, stored, or persisted** on the server
- For maximum security:
  - Create tokens with minimal required scopes
  - Use fine-grained tokens with specific repository access
  - Revoke tokens after use
  - Never commit tokens to version control

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Runtime:** Node.js
- **Libraries:** 
  - JSZip - Archive creation
  - Tailwind CSS - Styling
- **APIs:** 
  - GitHub REST API
  - File System Access API (for modern save dialogs)

## Use Cases

- 📚 **AI Training** - Prepare codebases for LLM fine-tuning
- 🤖 **AI Context** - Feed repositories to ChatGPT, Claude, etc.
- 📊 **Code Analysis** - Bulk analysis of source code
- 📝 **Documentation** - Generate documentation from code
- 🔍 **Code Review** - Share codebases in readable format

## Deployment

### Vercel (Recommended)

```bash
npm install -g vercel
vercel
```

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

## Contributing

Contributions welcome! Please feel free to submit a Pull Request.

## License

MIT License - feel free to use this for any purpose.

## Troubleshooting

### "404 Not Found" errors
- For public repos: Check the URL is correct and repo exists
- For private repos: Ensure you've added a valid GitHub token
- For org repos: Verify your token has access to the organization

### "401 Unauthorized" or "403 Forbidden"
- Token may be invalid or expired
- Token may lack required `repo` scope
- For org repos, check organization access permissions

### Large repositories timing out
- Try specifying a specific branch instead of default
- Consider adjusting `MAX_FILE_BYTES` limit
- Some very large repos may hit serverless function limits

## Roadmap

- [ ] GitLab private token support
- [ ] Bitbucket App Password support
- [ ] Custom file filters via UI
- [ ] Direct clipboard output option
- [ ] Streaming for very large repos
- [ ] API rate limit handling with retries

---

Built with ❤️ using Next.js
