// The "driven by" menu shared by the deep effects (Time, Scan): what decides
// how much the effect does at each point. driveAt() in common.glsl.js reads
// it; an effect that has it declares `uses: { drive: true }` and a `drive`
// parameter made from this.
//   Itself     the effect's own choice (Time: its shapes; Scan: brightness)
//   Input B    input B's brightness
//   Motion     movement in input A (the motion map, with its short wake)
//   The body   the person (segmentation, which the engine switches on by
//              itself while a live effect is driven by the body)
export const DRIVE = { ITSELF: 0, INPUT_B: 1, MOTION: 2, BODY: 3 };

export const driveParam = () => ({
  label: 'driven by',
  options: { Itself: DRIVE.ITSELF, 'Input B': DRIVE.INPUT_B, Motion: DRIVE.MOTION, 'The body': DRIVE.BODY },
  default: DRIVE.ITSELF,
});

// The value of an instance's drive parameter, as a whole number.
export const driveOf = (values) => Math.round(values?.drive ?? 0);
