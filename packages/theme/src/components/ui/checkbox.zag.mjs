// Choice type="checkbox" on Zag checkbox (C-160, D-Z7). The native <input> stays the form control:
// it submits and toggles with JS off; the machine mirrors it and surfaces the change.
import { readDom as choiceDom } from './choice.mjs';

export { connect, machine } from '@zag-js/checkbox';
export { render } from './choice.mjs';
export const readDom = choiceDom('checkbox');
