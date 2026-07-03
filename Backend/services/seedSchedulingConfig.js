const OneTimeService = require('../models/OneTimeService');
const TimeSlotConfig = require('../models/TimeSlotConfig');
const WorkerAvailability = require('../models/WorkerAvailability');
const Worker = require('../models/Worker');

const seedSchedulingConfig = async () => {
  try {
    console.log('[Seeding] Checking schedule slots and availability configurations...');
    
    // 1. Get all OneTimeServices
    const services = await OneTimeService.find();
    if (services.length === 0) {
      console.log('[Seeding] No OneTimeServices found in DB. Skipping slots seed.');
      return;
    }

    const defaultCity = 'Indore';
    const standardSlots = [
      { start: '09:00', end: '10:00' },
      { start: '10:00', end: '11:00' },
      { start: '11:00', end: '12:00' },
      { start: '12:00', end: '13:00' },
      { start: '13:00', end: '14:00' },
      { start: '14:00', end: '15:00' },
      { start: '15:00', end: '16:00' },
      { start: '16:00', end: '17:00' },
      { start: '17:00', end: '18:00' },
      { start: '18:00', end: '19:00' },
      { start: '19:00', end: '20:00' }
    ];

    let slotsCreated = 0;
    
    // Seed TimeSlotConfigs for each service
    for (const service of services) {
      const existingConfigs = await TimeSlotConfig.countDocuments({ serviceId: service._id, city: defaultCity });
      if (existingConfigs === 0) {
        // Create standard slots config
        const configsToInsert = standardSlots.map(slot => ({
          serviceId: service._id,
          city: defaultCity,
          slotStartTime: slot.start,
          slotEndTime: slot.end,
          maxBookingsPerSlot: 5,
          isActive: true
        }));
        await TimeSlotConfig.insertMany(configsToInsert);
        slotsCreated += configsToInsert.length;
      }
    }
    
    if (slotsCreated > 0) {
      console.log(`[Seeding] Created ${slotsCreated} default TimeSlotConfigs for ${services.length} services in ${defaultCity}`);
    } else {
      console.log('[Seeding] TimeSlotConfigs already seeded.');
    }

    // 2. Seed WorkerAvailability
    const workers = await Worker.find();
    if (workers.length === 0) {
      console.log('[Seeding] No workers found to seed availability.');
      return;
    }

    const serviceIds = services.map(s => s._id);
    let workerAvailCreated = 0;

    for (const worker of workers) {
      const existingAvail = await WorkerAvailability.findOne({ workerId: worker._id });
      if (!existingAvail) {
        const workerAvail = new WorkerAvailability({
          workerId: worker._id,
          serviceIds,
          workingDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
          startTime: '08:00',
          endTime: '21:00',
          blockedDates: [],
          status: 'active'
        });
        await workerAvail.save();
        workerAvailCreated++;
      }
    }

    if (workerAvailCreated > 0) {
      console.log(`[Seeding] Seeded WorkerAvailability configs for ${workerAvailCreated} workers`);
    } else {
      console.log('[Seeding] WorkerAvailability configs already seeded.');
    }

  } catch (error) {
    console.error('[Seeding Error] Failed to seed scheduling configurations:', error);
  }
};

module.exports = seedSchedulingConfig;
