# Note-U

A portable, serverless note editor.

Everything lives inside the URL.

No account.
No backend.
No database.

Just a link.

## Development

The site has no build step and can be served by any static web server. JavaScript,
CSS and HTML each have a single source file; `index.html` references those files
directly so the deployed GitHub Pages output is the repository contents.

Run the automated URL-format checks with:

```sh
npm test
```
