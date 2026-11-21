import worker from './worker.mjs';
import catalog from './catalog.json';
export default {fetch(request,env,ctx){return worker.fetch(request,{...env,MATERIAL_CATALOG:catalog},ctx);}};
