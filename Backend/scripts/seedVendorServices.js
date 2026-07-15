require('dotenv').config();
const mongoose = require('mongoose');
const ServiceCategory = require('../models/ServiceCategory');

const MONGO_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/wbi";

const categoriesToSeed = [
  {
    name: "CCTV & Surveillance",
    categoryCode: "C01",
    serviceType: "enterprise",
    audience: "b2b",
    color: "#2563eb",
    subCategories: [{
      subCatCode: "C01-01",
      subCatName: "CCTV Camera Installation",
      defaultMilestones: ["Site Survey", "Cabling", "Mounting", "Configuration", "Testing"],
      requiredTools: ["Drill Machine", "Multimeter", "Crimping Tool", "Ladder"],
      estimatedDays: 2,
      defaultChecklist: ["Camera angle adjusted", "DVR connected to internet", "Night vision tested"]
    }],
    projectTemplates: [{
      templateName: "Standard CCTV Rollout",
      phases: ["Site Survey", "Procurement", "Cabling", "Installation", "Testing", "Handover"],
      requiredCertifications: ["CCTV Technician Level 1"],
      defaultSLADays: 5
    }],
    complianceRequirements: {
      certifications: ["Basic Electrical Safety"],
      insuranceRequired: true,
      govtApprovalRequired: false
    }
  },
  {
    name: "IT & Computer Services",
    categoryCode: "C02",
    serviceType: "enterprise",
    audience: "b2b",
    color: "#4f46e5",
    subCategories: [{
      subCatCode: "C02-01",
      subCatName: "Hardware Deployment",
      defaultMilestones: ["Unboxing", "OS Installation", "Network Join", "Handover"],
      requiredTools: ["Screwdriver set", "USB Drive"],
      estimatedDays: 1,
      defaultChecklist: ["OS Updated", "Domain Joined"]
    }],
    projectTemplates: [{
      templateName: "Office IT Setup",
      phases: ["Hardware Delivery", "Setup", "Network Config", "Handover"],
      requiredCertifications: ["CompTIA A+"],
      defaultSLADays: 3
    }],
    complianceRequirements: {
      certifications: [],
      insuranceRequired: false,
      govtApprovalRequired: false
    }
  },
  {
    name: "Networking & Internet",
    categoryCode: "C03",
    serviceType: "enterprise",
    audience: "b2b",
    color: "#059669",
    subCategories: [{
      subCatCode: "C03-01",
      subCatName: "Router & Switch Installation",
      defaultMilestones: ["Cable Laying", "Rack Mounting", "Configuration", "Testing"],
      requiredTools: ["LAN Tester", "Crimping Tool"],
      estimatedDays: 2,
      defaultChecklist: ["Ping test successful", "Cables labelled"]
    }],
    projectTemplates: [{
      templateName: "Office Network Setup",
      phases: ["Survey", "Cabling", "Rack Setup", "Configuration", "Testing"],
      requiredCertifications: ["CCNA"],
      defaultSLADays: 7
    }],
    complianceRequirements: {
      certifications: [],
      insuranceRequired: true,
      govtApprovalRequired: false
    }
  },
  {
    name: "Energy & Power Backup",
    categoryCode: "C04",
    serviceType: "enterprise",
    audience: "b2b",
    color: "#d97706",
    subCategories: [{
      subCatCode: "C04-01",
      subCatName: "Solar Panel Installation",
      defaultMilestones: ["Structure Mounting", "Panel Fixing", "Inverter Connection", "Grid Sync"],
      requiredTools: ["Multimeter", "Harness", "Power Drill"],
      estimatedDays: 5,
      defaultChecklist: ["Voltage checked", "Earthing done"]
    }],
    projectTemplates: [{
      templateName: "Commercial Solar Setup",
      phases: ["Site Prep", "Mounting", "Wiring", "Testing", "Commissioning"],
      requiredCertifications: ["Solar Installation Cert"],
      defaultSLADays: 14
    }],
    complianceRequirements: {
      certifications: ["Electrical License"],
      insuranceRequired: true,
      govtApprovalRequired: true
    }
  },
  {
    name: "Banking & Financial Devices",
    categoryCode: "C05",
    serviceType: "enterprise",
    audience: "b2b",
    color: "#dc2626",
    subCategories: [{
      subCatCode: "C05-01",
      subCatName: "ATM Installation",
      defaultMilestones: ["Site Prep", "Machine Placement", "Network Sync", "Cash Test"],
      requiredTools: ["Heavy lifter", "Network tester"],
      estimatedDays: 3,
      defaultChecklist: ["Grout complete", "Network active"]
    }],
    projectTemplates: [{
      templateName: "ATM Rollout",
      phases: ["Civil Work", "Installation", "Network Config", "Live Test"],
      requiredCertifications: ["Bank Security Clearance"],
      defaultSLADays: 7
    }],
    complianceRequirements: {
      certifications: ["Police Verification"],
      insuranceRequired: true,
      govtApprovalRequired: true
    }
  },
  { name: "Security Systems", categoryCode: "C07", serviceType: "enterprise", audience: "b2b", color: "#1d4ed8" },
  { name: "Telecom & Communication", categoryCode: "C08", serviceType: "enterprise", audience: "b2b", color: "#7c3aed" },
  { name: "Healthcare Equipment", categoryCode: "C10", serviceType: "enterprise", audience: "b2b", color: "#10b981" },
  { name: "Agricultural Machinery", categoryCode: "C11", serviceType: "enterprise", audience: "b2b", color: "#65a30d" },
  { name: "Office & Commercial Equipment", categoryCode: "C15", serviceType: "enterprise", audience: "b2b", color: "#0ea5e9" },
  { name: "Industrial Machinery & Automation", categoryCode: "C16", serviceType: "enterprise", audience: "b2b", color: "#be185d" },
  { name: "Elevator & Lift Services", categoryCode: "C18", serviceType: "enterprise", audience: "b2b", color: "#475569" },
  { name: "Fire & Safety Equipment", categoryCode: "C19", serviceType: "enterprise", audience: "b2b", color: "#e11d48" },
  { name: "Educational & Institutional Equipment", categoryCode: "C20", serviceType: "enterprise", audience: "b2b", color: "#f59e0b" },
  { name: "Retail & POS Equipment", categoryCode: "C21", serviceType: "enterprise", audience: "b2b", color: "#8b5cf6" },
  { name: "Smart Home Automation", categoryCode: "C23", serviceType: "enterprise", audience: "b2b", color: "#06b6d4" }
];

async function seedCategories() {
  try {
    console.log("Connecting to Database...");
    await mongoose.connect(MONGO_URI);
    console.log("Connected Successfully.");

    for (let cat of categoriesToSeed) {
      // Find by name or code
      const existing = await ServiceCategory.findOne({ name: cat.name });
      if (existing) {
        console.log(`Updating existing category: ${cat.name}`);
        await ServiceCategory.findByIdAndUpdate(existing._id, {
          $set: {
            categoryCode: cat.categoryCode,
            serviceType: cat.serviceType || 'enterprise',
            audience: cat.audience || 'b2b',
            color: cat.color || '#3b82f6',
            subCategories: cat.subCategories || [],
            projectTemplates: cat.projectTemplates || [],
            complianceRequirements: cat.complianceRequirements || {}
          }
        });
      } else {
        console.log(`Creating new category: ${cat.name}`);
        const newCat = new ServiceCategory({
          name: cat.name,
          slug: cat.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
          categoryCode: cat.categoryCode,
          serviceType: cat.serviceType || 'enterprise',
          audience: cat.audience || 'b2b',
          color: cat.color || '#3b82f6',
          subCategories: cat.subCategories || [],
          projectTemplates: cat.projectTemplates || [],
          complianceRequirements: cat.complianceRequirements || {}
        });
        await newCat.save();
      }
    }
    
    console.log("Seeding Completed Successfully.");
    process.exit(0);
  } catch (error) {
    console.error("Seeding Error:", error);
    process.exit(1);
  }
}

seedCategories();
