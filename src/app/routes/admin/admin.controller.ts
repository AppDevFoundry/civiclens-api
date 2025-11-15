/**
 * Admin Dashboard Controller
 *
 * Serves the admin dashboard for monitoring sync jobs and data.
 */

import { Router, Request, Response } from 'express';

const router = Router();

/**
 * GET /admin
 * Serve the admin dashboard
 */
router.get('/', (req: Request, res: Response) => {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CivicLens Admin Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
      color: #333;
      line-height: 1.6;
    }
    .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
    header {
      background: #1a365d;
      color: white;
      padding: 20px;
      margin-bottom: 20px;
    }
    header h1 { font-size: 24px; }
    header p { opacity: 0.8; font-size: 14px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
    .card {
      background: white;
      border-radius: 8px;
      padding: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .card h2 {
      font-size: 16px;
      color: #555;
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 1px solid #eee;
    }
    .stat { margin-bottom: 12px; }
    .stat-label { font-size: 12px; color: #666; text-transform: uppercase; }
    .stat-value { font-size: 24px; font-weight: 600; color: #1a365d; }
    .stat-small { font-size: 14px; }
    .status-badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
    }
    .status-completed { background: #c6f6d5; color: #22543d; }
    .status-running { background: #bee3f8; color: #2a4365; }
    .status-failed { background: #fed7d7; color: #742a2a; }
    .status-pending { background: #fefcbf; color: #744210; }
    .btn {
      display: inline-block;
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;
    }
    .btn-primary { background: #3182ce; color: white; }
    .btn-primary:hover { background: #2c5282; }
    .btn-secondary { background: #e2e8f0; color: #4a5568; }
    .btn-secondary:hover { background: #cbd5e0; }
    .btn-danger { background: #e53e3e; color: white; }
    .btn-danger:hover { background: #c53030; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-group { display: flex; gap: 8px; flex-wrap: wrap; }
    .job-list { max-height: 400px; overflow-y: auto; }
    .job-item {
      padding: 12px;
      border-bottom: 1px solid #eee;
      font-size: 13px;
    }
    .job-item:last-child { border-bottom: none; }
    .job-header { display: flex; justify-content: space-between; align-items: center; }
    .job-type { font-weight: 600; }
    .job-time { color: #666; font-size: 12px; }
    .job-details { margin-top: 4px; color: #666; }
    .breakdown { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
    .breakdown-item {
      background: #f7fafc;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
    }
    .policy-list { max-height: 200px; overflow-y: auto; }
    .policy-item {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      border-bottom: 1px solid #f0f0f0;
      font-size: 13px;
    }
    .loading { text-align: center; padding: 40px; color: #666; }
    .error { background: #fed7d7; color: #742a2a; padding: 10px; border-radius: 4px; }
    .success { background: #c6f6d5; color: #22543d; padding: 10px; border-radius: 4px; }
    .refresh-indicator {
      float: right;
      font-size: 12px;
      color: #666;
      font-weight: normal;
    }
    .alert { margin-bottom: 15px; padding: 12px; border-radius: 4px; }
    .wide-card { grid-column: 1 / -1; }
    @media (max-width: 768px) {
      .grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <header>
    <h1>CivicLens Admin Dashboard</h1>
    <p>Congress.gov API Sync Monitor</p>
  </header>

  <div class="container">
    <div id="alerts"></div>

    <div class="grid">
      <!-- Database Stats -->
      <div class="card">
        <h2>Database Overview <span class="refresh-indicator" id="last-refresh"></span></h2>
        <div id="db-stats">
          <div class="loading">Loading...</div>
        </div>
      </div>

      <!-- Sync Controls -->
      <div class="card">
        <h2>Sync Controls</h2>
        <div class="btn-group" style="margin-bottom: 15px;">
          <button class="btn btn-primary" onclick="triggerSync('members')">Sync Members</button>
          <button class="btn btn-primary" onclick="triggerSync('bills')">Sync Bills</button>
          <button class="btn btn-secondary" onclick="fixBrokenMembers()">Fix Broken Records</button>
        </div>
        <div id="sync-status"></div>
      </div>

      <!-- Member Stats -->
      <div class="card">
        <h2>Members Breakdown</h2>
        <div id="member-stats">
          <div class="loading">Loading...</div>
        </div>
      </div>

      <!-- Bill Stats -->
      <div class="card">
        <h2>Bills Breakdown</h2>
        <div id="bill-stats">
          <div class="loading">Loading...</div>
        </div>
      </div>

      <!-- Top Policy Areas -->
      <div class="card">
        <h2>Top Policy Areas</h2>
        <div id="policy-areas">
          <div class="loading">Loading...</div>
        </div>
      </div>

      <!-- Last Sync Jobs -->
      <div class="card">
        <h2>Last Sync Jobs</h2>
        <div id="last-jobs">
          <div class="loading">Loading...</div>
        </div>
      </div>

      <!-- Job History -->
      <div class="card wide-card">
        <h2>Sync Job History</h2>
        <div class="job-list" id="job-history">
          <div class="loading">Loading...</div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const API_BASE = '/api/sync';
    let refreshInterval;

    // Format date
    function formatDate(dateStr) {
      if (!dateStr) return 'N/A';
      const date = new Date(dateStr);
      return date.toLocaleString();
    }

    // Format duration
    function formatDuration(start, end) {
      if (!start || !end) return '';
      const ms = new Date(end) - new Date(start);
      const seconds = Math.floor(ms / 1000);
      if (seconds < 60) return seconds + 's';
      const minutes = Math.floor(seconds / 60);
      return minutes + 'm ' + (seconds % 60) + 's';
    }

    // Status badge
    function statusBadge(status) {
      const classes = {
        'completed': 'status-completed',
        'running': 'status-running',
        'failed': 'status-failed',
        'pending': 'status-pending'
      };
      return '<span class="status-badge ' + (classes[status] || '') + '">' + status + '</span>';
    }

    // Show alert
    function showAlert(message, type = 'success') {
      const alerts = document.getElementById('alerts');
      const alert = document.createElement('div');
      alert.className = 'alert ' + type;
      alert.textContent = message;
      alerts.appendChild(alert);
      setTimeout(() => alert.remove(), 5000);
    }

    // Load status data
    async function loadStatus() {
      try {
        const res = await fetch(API_BASE + '/status');
        const data = await res.json();

        // Update last refresh time
        document.getElementById('last-refresh').textContent =
          'Updated: ' + new Date().toLocaleTimeString();

        // Database stats
        const dbStats = document.getElementById('db-stats');
        const brokenAlert = data.database.brokenMembers > 0
          ? '<div class="error" style="margin-bottom:10px;">' + data.database.brokenMembers + ' broken member records</div>'
          : '';
        dbStats.innerHTML = brokenAlert +
          '<div class="stat"><div class="stat-label">Total Members</div><div class="stat-value">' + data.database.totalMembers + '</div></div>' +
          '<div class="stat"><div class="stat-label">Total Bills</div><div class="stat-value">' + data.database.totalBills + '</div></div>' +
          '<div class="stat"><div class="stat-label">Sync Status</div><div class="stat-value stat-small">' + (data.enabled ? 'Enabled' : 'Disabled') + '</div></div>';

        // Member stats
        const memberStats = document.getElementById('member-stats');
        const partyBreakdown = Object.entries(data.database.membersByParty)
          .map(([party, count]) => '<span class="breakdown-item">' + party + ': ' + count + '</span>')
          .join('');
        const chamberBreakdown = Object.entries(data.database.membersByChamber)
          .map(([chamber, count]) => '<span class="breakdown-item">' + chamber + ': ' + count + '</span>')
          .join('');
        memberStats.innerHTML =
          '<div class="stat-label">By Party</div><div class="breakdown">' + partyBreakdown + '</div>' +
          '<div class="stat-label" style="margin-top:12px;">By Chamber</div><div class="breakdown">' + chamberBreakdown + '</div>';

        // Bill stats
        const billStats = document.getElementById('bill-stats');
        const typeBreakdown = Object.entries(data.database.billsByType)
          .map(([type, count]) => '<span class="breakdown-item">' + type + ': ' + count + '</span>')
          .join('');
        billStats.innerHTML =
          '<div class="stat-label">By Type</div><div class="breakdown">' + typeBreakdown + '</div>';

        // Policy areas
        const policyAreas = document.getElementById('policy-areas');
        const policyList = data.database.topPolicyAreas
          .map(p => '<div class="policy-item"><span>' + p.area + '</span><span>' + p.count + '</span></div>')
          .join('');
        policyAreas.innerHTML = '<div class="policy-list">' + policyList + '</div>';

        // Last jobs
        const lastJobs = document.getElementById('last-jobs');
        let jobsHtml = '';

        if (data.members.lastJob) {
          const mj = data.members.lastJob;
          jobsHtml += '<div class="job-item">' +
            '<div class="job-header"><span class="job-type">Members</span>' + statusBadge(mj.status) + '</div>' +
            '<div class="job-details">' + formatDate(mj.completedAt) + ' - ' + mj.recordsProcessed + ' records</div>' +
            (mj.errorMessage ? '<div class="error" style="margin-top:4px;font-size:12px;">' + mj.errorMessage + '</div>' : '') +
            '</div>';
        }

        if (data.bills.lastJob) {
          const bj = data.bills.lastJob;
          jobsHtml += '<div class="job-item">' +
            '<div class="job-header"><span class="job-type">Bills</span>' + statusBadge(bj.status) + '</div>' +
            '<div class="job-details">' + formatDate(bj.completedAt) + ' - ' + bj.recordsProcessed + ' records</div>' +
            (bj.errorMessage ? '<div class="error" style="margin-top:4px;font-size:12px;">' + bj.errorMessage + '</div>' : '') +
            '</div>';
        }

        lastJobs.innerHTML = jobsHtml || '<div class="loading">No sync jobs yet</div>';

      } catch (error) {
        console.error('Failed to load status:', error);
      }
    }

    // Load job history
    async function loadJobHistory() {
      try {
        const res = await fetch(API_BASE + '/jobs?limit=20');
        const data = await res.json();

        const jobHistory = document.getElementById('job-history');

        if (!data.jobs || data.jobs.length === 0) {
          jobHistory.innerHTML = '<div class="loading">No sync jobs found</div>';
          return;
        }

        const jobsHtml = data.jobs.map(job =>
          '<div class="job-item">' +
          '<div class="job-header">' +
          '<span class="job-type">' + job.jobType + '</span>' +
          statusBadge(job.status) +
          '</div>' +
          '<div class="job-details">' +
          '<span class="job-time">' + formatDate(job.startedAt) + '</span>' +
          ' - ' + job.recordsProcessed + ' records, ' + job.apiRequestsMade + ' API calls' +
          (job.completedAt ? ' (' + formatDuration(job.startedAt, job.completedAt) + ')' : '') +
          '</div>' +
          (job.errorMessage ? '<div class="error" style="margin-top:4px;font-size:12px;">' + job.errorMessage + '</div>' : '') +
          '</div>'
        ).join('');

        jobHistory.innerHTML = jobsHtml;

      } catch (error) {
        console.error('Failed to load job history:', error);
        document.getElementById('job-history').innerHTML =
          '<div class="error">Failed to load job history</div>';
      }
    }

    // Trigger sync
    async function triggerSync(type) {
      const statusDiv = document.getElementById('sync-status');
      statusDiv.innerHTML = '<div class="loading">Running ' + type + ' sync...</div>';

      try {
        const res = await fetch(API_BASE + '/' + type, { method: 'POST' });
        const data = await res.json();

        if (data.success) {
          statusDiv.innerHTML = '<div class="success">Synced ' + data.recordsProcessed + ' ' + type + '</div>';
          showAlert(type + ' sync completed: ' + data.recordsProcessed + ' records');
        } else {
          statusDiv.innerHTML = '<div class="error">Sync failed: ' + (data.errorMessage || 'Unknown error') + '</div>';
          showAlert('Sync failed: ' + (data.errorMessage || 'Unknown error'), 'error');
        }

        // Reload data
        loadStatus();
        loadJobHistory();

      } catch (error) {
        statusDiv.innerHTML = '<div class="error">Request failed: ' + error.message + '</div>';
        showAlert('Request failed: ' + error.message, 'error');
      }
    }

    // Fix broken members
    async function fixBrokenMembers() {
      const statusDiv = document.getElementById('sync-status');
      statusDiv.innerHTML = '<div class="loading">Fixing broken member records...</div>';

      try {
        const res = await fetch(API_BASE + '/members/fix-broken', { method: 'POST' });
        const data = await res.json();

        if (data.success) {
          statusDiv.innerHTML = '<div class="success">' + data.message + '</div>';
          showAlert(data.message);
        } else {
          statusDiv.innerHTML = '<div class="error">' + data.message + '</div>';
          showAlert(data.message, 'error');
        }

        // Reload data
        loadStatus();

      } catch (error) {
        statusDiv.innerHTML = '<div class="error">Request failed: ' + error.message + '</div>';
        showAlert('Request failed: ' + error.message, 'error');
      }
    }

    // Initial load
    loadStatus();
    loadJobHistory();

    // Auto-refresh every 30 seconds
    refreshInterval = setInterval(() => {
      loadStatus();
      loadJobHistory();
    }, 30000);
  </script>
</body>
</html>
`;

  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

export default router;
