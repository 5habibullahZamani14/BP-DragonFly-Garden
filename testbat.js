const { exec } = require('child_process');
exec('copy /B "C:\\Anything Important\\BP-DragonFly-Garden\\testprint.txt" "\\\\localhost\\BP_DragonFly_Garden_Confirmed"', (err, out, errOut) => {
  console.log('ERR:', err);
  console.log('OUT:', out);
  console.log('ERROUT:', errOut);
});
