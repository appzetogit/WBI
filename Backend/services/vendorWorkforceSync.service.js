/**
 * Sync linked Engineers → VendorWorkforceEngineer and keep availability consistent
 * with leave + ops assignments.
 */
const mongoose = require('mongoose');
const Engineer = require('../models/Engineer');
const Vendor = require('../models/Vendor');
const VendorWorkforceEngineer = require('../models/VendorWorkforceEngineer');
const VendorWorkforceAssignment = require('../models/VendorWorkforceAssignment');
const VendorWorkforceLeave = require('../models/VendorWorkforceLeave');
const { publishVendorNotification } = require('./vendorNotificationCenter.service');

function mapEngineerAvailability(eng) {
  // Engineer.status is online/offline style; use jobs as hint
  if (eng.vendorApprovalStatus === 'rejected' || eng.approvalStatus === 'suspended') return 'offline';
  return 'available';
}

async function syncLinkedEngineers(vendorId) {
  const vendor = await Vendor.findById(vendorId).select('approvedServices').lean();
  const primary =
    (vendor?.approvedServices || []).find((s) => s.status === 'active' || s.status === 'approved') ||
    (vendor?.approvedServices || [])[0];
  const serviceCategoryCode = primary?.categoryCode || 'GEN';
  const serviceCategoryName = primary?.categoryName || primary?.name || 'General';

  const linked = await Engineer.find({
    vendorId: new mongoose.Types.ObjectId(vendorId),
    $or: [
      { vendorApprovalStatus: 'approved' },
      {
        approvalStatus: 'approved',
        $or: [
          { vendorApprovalStatus: { $in: ['approved', 'not_required'] } },
          { vendorApprovalStatus: { $exists: false } },
          { vendorApprovalStatus: null }
        ]
      }
    ]
  })
    .select('name email phone profilePhoto primarySkill primaryCategory rating totalJobs address city vendorApprovalStatus approvalStatus status')
    .limit(200)
    .lean();

  let created = 0;
  let updated = 0;

  for (const eng of linked) {
    const existing = await VendorWorkforceEngineer.findOne({
      vendorId,
      linkedEngineerId: eng._id,
      demoTag: null
    });

    const payload = {
      vendorId,
      linkedEngineerId: eng._id,
      name: eng.name || 'Engineer',
      email: eng.email || '',
      phone: eng.phone || '',
      photo: eng.profilePhoto || '',
      role: 'Field Engineer',
      department: 'Operations',
      serviceCategoryCode: eng.primaryCategory || serviceCategoryCode,
      serviceCategoryName,
      primarySkill: eng.primarySkill || '',
      skills: (eng.primarySkill ? [{ name: eng.primarySkill, proficiency: 70 }] : []),
      city: eng.address?.city || eng.city || '',
      rating: eng.rating || 0,
      status: eng.approvalStatus === 'suspended' ? 'suspended' : 'active',
      demoTag: null
    };

    if (existing) {
      // Don't overwrite leave/on_project availability from sync
      const preserveAvail = ['leave', 'on_project', 'busy', 'traveling'].includes(existing.availability);
      Object.assign(existing, payload);
      if (!preserveAvail) existing.availability = mapEngineerAvailability(eng);
      await existing.save();
      updated += 1;
    } else {
      await VendorWorkforceEngineer.create({
        ...payload,
        availability: mapEngineerAvailability(eng),
        experienceYears: 0,
        certificationLevel: 'mid'
      });
      created += 1;
    }
  }

  // Apply active approved leaves → availability leave
  const now = new Date();
  const leaves = await VendorWorkforceLeave.find({
    vendorId,
    demoTag: null,
    status: 'approved',
    startDate: { $lte: now },
    endDate: { $gte: now }
  }).lean();

  for (const leave of leaves) {
    if (leave.engineerId) {
      await VendorWorkforceEngineer.updateOne(
        { _id: leave.engineerId, vendorId },
        { $set: { availability: 'leave' } }
      );
    } else if (leave.employeeId) {
      await VendorWorkforceEngineer.updateOne(
        { vendorId, employeeId: leave.employeeId },
        { $set: { availability: 'leave' } }
      );
    }
  }

  // Open assignments → on_project
  const openAsg = await VendorWorkforceAssignment.find({
    vendorId,
    demoTag: null,
    status: { $in: ['assigned', 'in_progress', 'escalated'] }
  }).lean();

  for (const asg of openAsg) {
    if (asg.engineerId) {
      await VendorWorkforceEngineer.updateOne(
        { _id: asg.engineerId, vendorId, availability: { $ne: 'leave' } },
        { $set: { availability: 'on_project', todayTask: asg.task || asg.projectName } }
      );
    }
  }

  return { created, updated, linked: linked.length };
}

async function applyLeaveDecision(vendorId, leave, action) {
  const engineerQuery = leave.engineerId
    ? { _id: leave.engineerId, vendorId }
    : leave.employeeId
      ? { vendorId, employeeId: leave.employeeId }
      : null;

  if (action === 'approve') {
    if (engineerQuery) {
      await VendorWorkforceEngineer.updateOne(engineerQuery, { $set: { availability: 'leave' } });
    }
    await publishVendorNotification({
      vendorId,
      type: 'general',
      title: 'Leave approved',
      message: `Leave for ${leave.engineerName || 'engineer'} approved (${leave.leaveType || 'leave'}).`,
      module: 'workforce',
      priority: 'normal',
      relatedId: leave._id,
      relatedType: 'leave',
      actionUrl: 'workforce/leave',
      category: 'jobs'
    }).catch(() => null);
  }

  if (action === 'reject') {
    if (engineerQuery) {
      await VendorWorkforceEngineer.updateOne(
        { ...engineerQuery, availability: 'leave' },
        { $set: { availability: 'available' } }
      );
    }
  }
}

/**
 * Mirror Project Ops engineer assignment into Workforce Assignments + availability.
 */
async function mirrorOpsAssignment({
  vendorId,
  project,
  engineer,
  jobId = null
}) {
  let wf = await VendorWorkforceEngineer.findOne({
    vendorId,
    linkedEngineerId: engineer._id,
    demoTag: null
  });

  const baseFields = {
    vendorId,
    linkedEngineerId: engineer._id,
    name: engineer.name || 'Engineer',
    email: engineer.email || '',
    phone: engineer.phone || '',
    role: 'Field Engineer',
    department: 'Operations',
    serviceCategoryCode: project.serviceCategoryCode || 'GEN',
    serviceCategoryName: project.serviceCategoryName || '',
    availability: 'on_project',
    todayTask: project.title,
    status: 'active',
    demoTag: null
  };

  if (wf) {
    if (wf.availability === 'leave') {
      baseFields.availability = 'leave';
    }
    Object.assign(wf, baseFields);
    const code = project.projectCode || String(project._id);
    const already = (wf.assignedProjects || []).some((p) => p.projectCode === code);
    if (!already) {
      wf.assignedProjects = [
        ...(wf.assignedProjects || []),
        { name: project.title, projectCode: code }
      ];
    }
    await wf.save();
  } else {
    wf = await VendorWorkforceEngineer.create({
      ...baseFields,
      primarySkill: engineer.primarySkill || '',
      skills: engineer.primarySkill
        ? [{ name: engineer.primarySkill, proficiency: 70 }]
        : [],
      assignedProjects: [{
        name: project.title,
        projectCode: project.projectCode || String(project._id)
      }],
      experienceYears: 0,
      certificationLevel: 'mid'
    });
  }

  const existing = await VendorWorkforceAssignment.findOne({
    vendorId,
    projectCode: project.projectCode || String(project._id),
    engineerId: wf._id,
    status: { $in: ['assigned', 'in_progress'] },
    demoTag: null
  });

  if (!existing) {
    await VendorWorkforceAssignment.create({
      vendorId,
      projectName: project.title,
      projectCode: project.projectCode || String(project._id),
      engineerId: wf._id,
      engineerName: engineer.name || '',
      employeeId: wf.employeeId || '',
      task: `Ops job${jobId ? ` ${jobId}` : ''}`,
      serviceCategoryCode: project.serviceCategoryCode || '',
      serviceCategoryName: project.serviceCategoryName || '',
      startDate: new Date(),
      deadline: project.endDate || null,
      priority: project.priority || 'normal',
      status: 'assigned',
      location: project.city || '',
      city: project.city || '',
      demoTag: null
    });
  }

  await publishVendorNotification({
    vendorId,
    type: 'engineer_assigned',
    title: 'Engineer assigned',
    message: `${engineer.name} assigned to ${project.title}`,
    module: 'workforce',
    priority: 'normal',
    relatedId: project._id,
    relatedType: 'project',
    actionUrl: 'workforce/assignments',
    category: 'jobs'
  }).catch(() => null);

  return wf;
}

module.exports = {
  syncLinkedEngineers,
  applyLeaveDecision,
  mirrorOpsAssignment
};
