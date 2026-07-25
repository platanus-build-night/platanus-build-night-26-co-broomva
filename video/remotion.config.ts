import {Config} from '@remotion/cli/config';

Config.setEntryPoint('./src/index.ts');
Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
// No webfonts anywhere in this project, so there is nothing to wait on at
// render time beyond the tree itself.
Config.setChromiumOpenGlRenderer('angle');
