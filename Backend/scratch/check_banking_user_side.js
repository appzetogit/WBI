require('dotenv').config();
const mongoose = require('mongoose');
const ServiceCategory = require('../models/ServiceCategory');
const SubService = require('../models/SubService');
const FormSchema = require('../models/FormSchema');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const cats = await ServiceCategory.find({
    $or: [{ slug: /banking/i }, { name: /banking/i }, { categoryCode: 'C05' }]
  }).lean();

  for (const c of cats) {
    const subs = await SubService.find({ category: c._id }).select('name isActive startingPrice slug').lean();
    console.log(
      JSON.stringify(
        {
          id: String(c._id),
          name: c.name,
          slug: c.slug,
          code: c.categoryCode,
          active: c.isActive,
          showOnApp: c.showOnApp,
          embeddedSubs: (c.subCategories || []).map((s) => `${s.subCatCode}:${s.subCatName}`),
          subServices: subs.map((s) => ({ name: s.name, active: s.isActive !== false, slug: s.slug }))
        },
        null,
        2
      )
    );
  }

  const forms = await FormSchema.find({ categoryCode: 'C05', isActive: true })
    .select('subCatCode subCategoryName isActive')
    .lean();
  console.log('forms', JSON.stringify(forms, null, 2));

  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
