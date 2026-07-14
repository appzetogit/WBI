/**
 * WBI Project OS — Site Controller
 * Handles site CRUD and bulk CSV/Excel import.
 */

const ProjectSite = require('../../models/projectOS/ProjectSite');
const ProjectOS = require('../../models/projectOS/ProjectOS');
const { logActivity } = require('../../engines/workflowEngine');
const xlsx = require('xlsx');

// ─── GET sites for a project ──────────────────────────────────────────────────
exports.listSites = async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const { status, state, city, page = 1, limit = 50, search } = req.query;

    const query = { project: projectId, isDeleted: false };
    if (status) query.status = status;
    if (state) query['hierarchy.state'] = state;
    if (city) query['hierarchy.city'] = city;
    if (search) query.name = { $regex: search, $options: 'i' };

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [sites, total] = await Promise.all([
      ProjectSite.find(query)
        .select('siteCode name hierarchy status progress assignedTeam siteManagerId schedule slaStatus approvalStatus taskSummary issueCount gps')
        .sort({ 'hierarchy.state': 1, 'hierarchy.city': 1, name: 1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      ProjectSite.countDocuments(query)
    ]);

    // Get unique states and cities for filter options
    const stateList = await ProjectSite.distinct('hierarchy.state', { project: projectId, isDeleted: false });
    const cityList = state
      ? await ProjectSite.distinct('hierarchy.city', { project: projectId, 'hierarchy.state': state, isDeleted: false })
      : [];

    res.json({ success: true, data: sites, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)), filters: { states: stateList.filter(Boolean), cities: cityList.filter(Boolean) } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET single site ──────────────────────────────────────────────────────────
exports.getSite = async (req, res) => {
  try {
    const site = await ProjectSite.findById(req.params.siteId)
      .populate('assignedTeam', 'name phone profilePhoto')
      .populate('siteManagerId', 'name phone')
      .lean();

    if (!site || site.isDeleted) return res.status(404).json({ success: false, message: 'Site not found' });
    res.json({ success: true, data: site });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── POST create site ─────────────────────────────────────────────────────────
exports.createSite = async (req, res) => {
  try {
    const { id: projectId } = req.params;

    const project = await ProjectOS.findById(projectId, '_id title').lean();
    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });

    const site = await ProjectSite.create({ ...req.body, project: projectId });

    // Update project site count
    await ProjectOS.findByIdAndUpdate(projectId, {
      $inc: { 'stats.siteCount': 1, 'stats.pendingSites': 1 },
      lastActivityAt: new Date()
    });

    const actor = { id: req.user?._id, role: req.userRole, name: req.user?.name };
    await logActivity({ project: projectId, site: site._id, eventType: 'SITE_CREATED', description: `Site "${site.name}" created`, actor });

    res.status(201).json({ success: true, message: 'Site created', data: site });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// ─── PATCH update site ────────────────────────────────────────────────────────
exports.updateSite = async (req, res) => {
  try {
    const site = await ProjectSite.findById(req.params.siteId);
    if (!site || site.isDeleted) return res.status(404).json({ success: false, message: 'Site not found' });

    const prevStatus = site.status;
    Object.assign(site, req.body);
    await site.save();

    // Update project stats if status changed
    if (req.body.status && req.body.status !== prevStatus) {
      await _recalcProjectSiteStats(site.project);
    }

    res.json({ success: true, message: 'Site updated', data: site });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// ─── POST bulk import sites (CSV/Excel) ───────────────────────────────────────
exports.bulkImportSites = async (req, res) => {
  try {
    const { id: projectId } = req.params;
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet);

    if (rows.length === 0) return res.status(400).json({ success: false, message: 'File is empty' });
    if (rows.length > 1000) return res.status(400).json({ success: false, message: 'Maximum 1000 sites per import' });

    const results = { success: 0, failed: 0, errors: [] };
    const sitesToCreate = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // excel row (1=header, data starts at 2)

      if (!row['Site Name']) { results.errors.push({ row: rowNum, error: '"Site Name" is required' }); results.failed++; continue; }
      if (!row['State']) { results.errors.push({ row: rowNum, error: '"State" is required' }); results.failed++; continue; }
      if (!row['City']) { results.errors.push({ row: rowNum, error: '"City" is required' }); results.failed++; continue; }

      sitesToCreate.push({
        project: projectId,
        name: row['Site Name'],
        externalSiteCode: row['External Site Code'] || '',
        hierarchy: {
          region: row['Region'] || '',
          state: row['State'],
          city: row['City'],
          district: row['District'] || '',
          pincode: row['Pincode'] || ''
        },
        address: { line1: row['Address'] || '', landmark: row['Landmark'] || '' },
        gps: row['Lat'] && row['Lng'] ? { lat: parseFloat(row['Lat']), lng: parseFloat(row['Lng']) } : undefined,
        siteContact: {
          name: row['Contact Name'] || '',
          phone: row['Contact Phone'] || ''
        }
      });
    }

    if (sitesToCreate.length > 0) {
      const inserted = await ProjectSite.insertMany(sitesToCreate, { ordered: false });
      results.success = inserted.length;

      await ProjectOS.findByIdAndUpdate(projectId, {
        $inc: { 'stats.siteCount': inserted.length, 'stats.pendingSites': inserted.length },
        lastActivityAt: new Date()
      });

      const actor = { id: req.user?._id, role: req.userRole, name: req.user?.name };
      await logActivity({
        project: projectId, eventType: 'SITE_BULK_IMPORTED',
        description: `Bulk import: ${inserted.length} sites created, ${results.failed} failed`,
        actor, metadata: { total: rows.length, success: results.success, failed: results.failed }
      });
    }

    res.json({ success: true, message: `Import complete: ${results.success} created, ${results.failed} failed`, data: results });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET import template (downloadable Excel) ─────────────────────────────────
exports.getImportTemplate = async (req, res) => {
  const wb = xlsx.utils.book_new();
  const headers = [['Site Name', 'External Site Code', 'Region', 'State', 'City', 'District', 'Pincode', 'Address', 'Landmark', 'Lat', 'Lng', 'Contact Name', 'Contact Phone']];
  const ws = xlsx.utils.aoa_to_sheet(headers);
  xlsx.utils.book_append_sheet(wb, ws, 'Sites');
  const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.set({ 'Content-Disposition': 'attachment; filename="wbi_site_import_template.xlsx"', 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  res.send(buffer);
};

// ─── Internal: Recalculate site stats on project ──────────────────────────────
async function _recalcProjectSiteStats(projectId) {
  const [total, completed, inProgress, pending] = await Promise.all([
    ProjectSite.countDocuments({ project: projectId, isDeleted: false }),
    ProjectSite.countDocuments({ project: projectId, status: 'COMPLETED', isDeleted: false }),
    ProjectSite.countDocuments({ project: projectId, status: 'IN_PROGRESS', isDeleted: false }),
    ProjectSite.countDocuments({ project: projectId, status: { $in: ['PENDING', 'ASSIGNED'] }, isDeleted: false })
  ]);

  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
  await ProjectOS.findByIdAndUpdate(projectId, {
    'stats.siteCount': total,
    'stats.completedSites': completed,
    'stats.inProgressSites': inProgress,
    'stats.pendingSites': pending,
    progress,
    lastActivityAt: new Date()
  });
}
