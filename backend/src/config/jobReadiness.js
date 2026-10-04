// What "job ready" means, written down.
//
// The score is shown to students as the one number that answers "how ready am
// I?", so the way it is built has to be legible — a student who cannot see why
// it is 52 cannot do anything about it. Every weight in this file is sent to
// the browser and rendered next to its component, and the API returns the raw
// inputs alongside each score. There is no part of this that the student is not
// allowed to see.
//
// Weights per target sum to 100. They differ because the targets differ: a
// service-company drive is won on aptitude and clean basics, a product-company
// interview on harder DSA.

const COMPONENTS = {
  coverage: {
    label: 'Topic coverage',
    detail: 'Distinct problems solved in the topics this target tests.',
  },
  difficulty: {
    label: 'Difficulty',
    detail: 'How far past easy problems you have gone.',
  },
  consistency: {
    label: 'Consistency',
    detail: 'Days you solved something in the last 30.',
  },
  aptitude: {
    label: 'Aptitude & tests',
    detail: 'Your average score across aptitude and MCQ tests you have submitted.',
  },
  roadmap: {
    label: 'Roadmap progress',
    detail: 'How far along your chosen roadmap you are.',
  },
  courses: {
    label: 'Course work',
    detail: 'Problems completed in the courses your faculty assigned.',
  },
  external: {
    label: 'Verified external profile',
    detail: 'A linked and verified Codeforces or LeetCode account.',
  },
};

const TARGETS = [
  {
    key: 'service',
    label: 'Service companies',
    blurb: 'TCS, Infosys, Wipro, Accenture, Cognizant, Capgemini',
    // The aptitude round is the one most students actually fail, and the coding
    // rarely goes past medium — so aptitude is weighted above difficulty here.
    trackKey: 'service',
    weights: { coverage: 35, difficulty: 10, consistency: 15, aptitude: 20, roadmap: 10, courses: 10, external: 0 },
    // Share of solved problems expected to be medium or harder.
    hardShareTarget: 0.25,
  },
  {
    key: 'product',
    label: 'Product companies',
    blurb: 'Flipkart, Swiggy, Zomato, Razorpay, CRED',
    trackKey: 'product',
    weights: { coverage: 35, difficulty: 20, consistency: 15, aptitude: 5, roadmap: 10, courses: 10, external: 5 },
    hardShareTarget: 0.5,
  },
  {
    key: 'role',
    label: 'My roadmap role',
    blurb: 'Scored against the roadmap you are following.',
    // No fixed track: coverage comes from the active roadmap's own milestones.
    trackKey: null,
    weights: { coverage: 25, difficulty: 15, consistency: 15, aptitude: 5, roadmap: 25, courses: 10, external: 5 },
    hardShareTarget: 0.35,
  },
];

/** Active days in the last 30 that count as full marks for consistency. */
const CONSISTENCY_TARGET_DAYS = 15;

/** Courses component: problems finished across assigned courses for full marks. */
const COURSE_TARGET_PROBLEMS = 40;

module.exports = { COMPONENTS, TARGETS, CONSISTENCY_TARGET_DAYS, COURSE_TARGET_PROBLEMS };
