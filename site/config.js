// Settings of this download site. Edit the values below before publishing; nothing else needs to change.
// Empty values hide the parts of the site that depend on them. The site never loads anything from other hosts.
window.PA_CONFIG = {
  // Version of the release archive offered for download (file name: kontas-download-<version>.zip).
  version: '0.2.0',
  // Direct link to the release archive, absolute (https://...) or relative to this site (e.g. 'files/kontas-download-0.1.0.zip').
  downloadUrl: '',
  // Link to the checksum file kontas-download-<version>.zip.sha256, which sits next to the archive on the download page.
  sha256Url: '',
  // Repository page of the project (optional). When set, the About page links to the licence files in it.
  repoUrl: '',
  // Path between repoUrl and a file name for those links ('/blob/HEAD/' on GitHub, '/src/branch/main/' on Gitea/Forgejo).
  repoFilePath: '/blob/HEAD/',
  // Name of the licence shown on the About page. Empty: only "see the LICENSE file" is shown.
  licenseName: 'kontas.download Licence',
  // Support blocks: each one is shown only when its value is filled in.
  donateUrl: '',
  contactEmail: 'info@kontas.download',
  issuesUrl: ''
};
