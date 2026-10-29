import {simulateNetwork,type Network} from "./network";
self.onmessage=(e:MessageEvent<{id:number;config:Network}>)=>{try{self.postMessage({id:e.data.id,run:simulateNetwork(e.data.config)});}catch(error){self.postMessage({id:e.data.id,error:error instanceof Error?error.message:String(error)});}};
