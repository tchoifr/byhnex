// Entry point added to every page. Active only on byhnex.com (not on the GitHub Pages copy nor local files).
import { startAccount } from './account'

const enabled = /(^|\.)byhnex\.com$/.test(location.hostname) && !document.body.classList.contains('embed')

if (enabled) void startAccount()
