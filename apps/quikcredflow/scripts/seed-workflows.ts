/**
 * Step D — port the 83 Active workflow-automation rules from UAT into the
 * monorepo, under ONE org. Flat copy of CrmWorkflowDefinition (status='Active').
 *
 *   $env:DATABASE_URL="...quikit_rohit_db"; npx tsx scripts/seed-workflows.ts <orgId>
 *
 * Transforms: tenantId -> orgId=<orgId>; triggerCount -> 0 (UAT runtime tally).
 * Everything else verbatim: id, name, status(Active), triggerType, graphNodes/
 * graphEdges JSON, lastPublishedOn. No user/template refs (verified). Single
 * transaction; aborts if any workflow already exists for the org.
 *
 * NOTE: rules only FIRE when Redis is up AND the worker runs (npm run worker).
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient({ log: ["error"] });

const ORG_ID = process.env.SEED_ORG_ID ?? process.argv[2];
if (!ORG_ID) {
  console.error("\u274c  orgId required. Usage: npx tsx scripts/seed-workflows.ts <orgId>");
  process.exit(1);
}

const ROWS = [
 {
  "id": "cmsipenqj00832qefki4mzhi5",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Not Interested",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 2,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T08:49:55.108Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msip2h1y-5rqj",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msip2jou-ju4t",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Demo Completed-demo Syncing"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Not Interested (For Making Payment)"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msip36hy-86sm",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Not Interested"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msip2jou-ju4t",
    "from": "trigger_lead_updated-msip2h1y-5rqj"
   },
   {
    "to": "update_lead_field-msip36hy-86sm",
    "from": "if_else-msip2jou-ju4t",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T08:49:41.036Z",
  "updatedAt": "2026-08-08T05:03:09.502Z",
  "deletedAt": null
 },
 {
  "id": "cmsipnse9008c2qef3u58wgzx",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "when not connected on demo scheduled stage -> Not Connected(Demo Scheduled)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 2,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T08:56:55.285Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msip5wql-hqlo",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msip5y7r-9kja",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Demo Scheduled"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Could Not Connect"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msip9gwm-8yz9",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Not Connected(Demo Scheduled)"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msip5y7r-9kja",
    "from": "trigger_lead_updated-msip5wql-hqlo"
   },
   {
    "to": "update_lead_field-msip9gwm-8yz9",
    "from": "if_else-msip5y7r-9kja",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T08:56:46.978Z",
  "updatedAt": "2026-08-07T11:06:44.865Z",
  "deletedAt": null
 },
 {
  "id": "cmsitq9tf008l2qefcumgku4o",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Demo Scheduled(Demo Completed-demo data)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 1,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T10:50:57.158Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msitau9e-6o0z",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msitaxm4-gz2b",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Demo Scheduled"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Demo Completed"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msitbo2t-8xg0",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Demo Completed Demo Data"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msitaxm4-gz2b",
    "from": "trigger_lead_updated-msitau9e-6o0z"
   },
   {
    "to": "update_lead_field-msitbo2t-8xg0",
    "from": "if_else-msitaxm4-gz2b",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T10:50:41.331Z",
  "updatedAt": "2026-08-07T11:07:35.741Z",
  "deletedAt": null
 },
 {
  "id": "cmsitsovm008m2qefh1a9ah74",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Demo Scheduled(Demo Rescheduled)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T10:52:40.692Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msitgm1k-hxso",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msitgo4w-1v6h",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Demo Scheduled"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Demo Rescheduled"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msith7m7-i75y",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Demo Scheduled"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msitgo4w-1v6h",
    "from": "trigger_lead_updated-msitgm1k-hxso"
   },
   {
    "to": "update_lead_field-msith7m7-i75y",
    "from": "if_else-msitgo4w-1v6h",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T10:52:34.162Z",
  "updatedAt": "2026-08-07T10:52:40.693Z",
  "deletedAt": null
 },
 {
  "id": "cmsituty5008n2qefurf95g4o",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Demo Scheduled(Call Back Demo Scheduled)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T10:55:17.768Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msitiizv-3azf",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msitj6as-13i2",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Demo Scheduled"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Call Back (Demo Scheduled)"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msitjs2j-4r3v",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Demo Scheduled"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msitj6as-13i2",
    "from": "trigger_lead_updated-msitiizv-3azf"
   },
   {
    "to": "update_lead_field-msitjs2j-4r3v",
    "from": "if_else-msitj6as-13i2",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T10:54:14.046Z",
  "updatedAt": "2026-08-07T10:55:17.769Z",
  "deletedAt": null
 },
 {
  "id": "cmsityolw008o2qefh65avqa2",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Demo Scheduled (Not Interested (For Demo Done)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 1,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T10:57:26.295Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msitlw37-eifl",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msitm7q1-8ed",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Demo Scheduled"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Not Interested (For Demo Done)"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msitms5d-82t6",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Not Interested"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msitm7q1-8ed",
    "from": "trigger_lead_updated-msitlw37-eifl"
   },
   {
    "to": "update_lead_field-msitms5d-82t6",
    "from": "if_else-msitm7q1-8ed",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T10:57:13.748Z",
  "updatedAt": "2026-08-08T05:08:24.081Z",
  "deletedAt": null
 },
 {
  "id": "cmsiu0h9c008p2qef7lai8yoj",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Demo scheduled (Future Lead)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 1,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T10:58:44.761Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msitottg-6vrr",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msitovq7-cxw6",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Demo Scheduled"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Future Lead"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msitpbp4-gthk",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Future Lead"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msitovq7-cxw6",
    "from": "trigger_lead_updated-msitottg-6vrr"
   },
   {
    "to": "update_lead_field-msitpbp4-gthk",
    "from": "if_else-msitovq7-cxw6",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T10:58:37.536Z",
  "updatedAt": "2026-08-07T11:10:59.048Z",
  "deletedAt": null
 },
 {
  "id": "cmsiu2kw2008q2qefaghoykpf",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Demo Scheduled (Already paid Customer)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T11:00:24.284Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msitqas2-ises",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msitqcr8-dbnd",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Demo Scheduled"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Already Paid Customer"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msitqzro-ecju",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Demo Scheduled"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msitqcr8-dbnd",
    "from": "trigger_lead_updated-msitqas2-ises"
   },
   {
    "to": "update_lead_field-msitqzro-ecju",
    "from": "if_else-msitqcr8-dbnd",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T11:00:15.554Z",
  "updatedAt": "2026-08-07T11:00:24.285Z",
  "deletedAt": null
 },
 {
  "id": "cmsiu4726008r2qef3w4dmxs5",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Demo scheduled (Active Partner)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T11:01:36.796Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msitspsy-f591",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msitsrzr-lble",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Demo Scheduled"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Active Partner"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msittadl-1cw5",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Demo Scheduled"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msitsrzr-lble",
    "from": "trigger_lead_updated-msitspsy-f591"
   },
   {
    "to": "update_lead_field-msittadl-1cw5",
    "from": "if_else-msitsrzr-lble",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T11:01:30.942Z",
  "updatedAt": "2026-08-07T11:01:36.797Z",
  "deletedAt": null
 },
 {
  "id": "cmsiu5dbz008s2qefj91lyhef",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Demo Scheduled (Inactive Partner)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T11:02:30.947Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msitu00k-hes7",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msitu2w5-i7cs",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Demo Scheduled"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Inactive Partner"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msitufb6-16hx",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Demo Scheduled"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msitu2w5-i7cs",
    "from": "trigger_lead_updated-msitu00k-hes7"
   },
   {
    "to": "update_lead_field-msitufb6-16hx",
    "from": "if_else-msitu2w5-i7cs",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T11:02:25.728Z",
  "updatedAt": "2026-08-07T11:02:30.948Z",
  "deletedAt": null
 },
 {
  "id": "cmsiwh78x009h2qefudkuwlq4",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "New Lead(Disqualified)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 1,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T12:46:46.413Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msivz4ig-b2ur",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msivz6pt-bjri",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "New Lead"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Disqualified"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msiw5h6z-5kmu",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Disqualified"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msivz6pt-bjri",
    "from": "trigger_lead_updated-msivz4ig-b2ur"
   },
   {
    "to": "update_lead_field-msiw5h6z-5kmu",
    "from": "if_else-msivz6pt-bjri",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T12:07:36.946Z",
  "updatedAt": "2026-08-07T13:01:38.154Z",
  "deletedAt": null
 },
 {
  "id": "cmsiwjllt009i2qefl7x5qbyk",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "New Lead( Not Connected New Lead)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 5,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T12:46:52.075Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msiw6woz-5g12",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msiw6yjw-tig",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "New Lead"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Could Not Connect"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msiw7pu7-76rn",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Not Connected(New Lead)"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msiw6yjw-tig",
    "from": "trigger_lead_updated-msiw6woz-5g12"
   },
   {
    "to": "update_lead_field-msiw7pu7-76rn",
    "from": "if_else-msiw6yjw-tig",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T12:09:28.866Z",
  "updatedAt": "2026-08-08T05:04:36.688Z",
  "deletedAt": null
 },
 {
  "id": "cmsiwm63d009j2qefxpnojo1a",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "New Lead(Discussion Pending)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 2,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T12:46:59.730Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msiw9bkp-kzje",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msiw9e92-379y",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "New Lead"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Discussion Pending (Answered Calls)"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msiwa13r-ehcu",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Discussion Pending"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msiw9e92-379y",
    "from": "trigger_lead_updated-msiw9bkp-kzje"
   },
   {
    "to": "update_lead_field-msiwa13r-ehcu",
    "from": "if_else-msiw9e92-379y",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T12:11:28.729Z",
  "updatedAt": "2026-08-07T17:27:40.885Z",
  "deletedAt": null
 },
 {
  "id": "cmsiwqi6c009k2qefw03btygz",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "New Lead (Demo Scheduled)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 5,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T12:47:11.111Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msiwbyio-b0g8",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msiwc0de-8blz",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "New Lead"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Demo Scheduled"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msiwfdkp-gze1",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Demo Scheduled"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msiwc0de-8blz",
    "from": "trigger_lead_updated-msiwbyio-b0g8"
   },
   {
    "to": "update_lead_field-msiwfdkp-gze1",
    "from": "if_else-msiwc0de-8blz",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T12:14:51.013Z",
  "updatedAt": "2026-08-08T06:57:03.679Z",
  "deletedAt": null
 },
 {
  "id": "cmsiwuelw009l2qef9rl44mdp",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "New Lead(Not Interested)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T12:47:15.819Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msiwgbk5-ejkg",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msiwgdes-hdd3",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "New Lead"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Not Interested (For Scheduling Demo)"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msiwh2o5-g6mi",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Not Interested"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msiwgdes-hdd3",
    "from": "trigger_lead_updated-msiwgbk5-ejkg"
   },
   {
    "to": "update_lead_field-msiwh2o5-g6mi",
    "from": "if_else-msiwgdes-hdd3",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T12:17:53.012Z",
  "updatedAt": "2026-08-07T12:47:15.821Z",
  "deletedAt": null
 },
 {
  "id": "cmsiww1ov009m2qefft5v33wf",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "New Lead (Interested Follow-up Councelling)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T12:47:20.378Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msiwkavb-8cr9",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msiwkdk0-acng",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "New Lead"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Interested Followup"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msiwl30c-1w1y",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Interested-FollowUp"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msiwkdk0-acng",
    "from": "trigger_lead_updated-msiwkavb-8cr9"
   },
   {
    "to": "update_lead_field-msiwl30c-1w1y",
    "from": "if_else-msiwkdk0-acng",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T12:19:09.583Z",
  "updatedAt": "2026-08-08T08:05:47.284Z",
  "deletedAt": null
 },
 {
  "id": "cmsiwxruj009n2qefkjipkdqg",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "New Lead (Future Lead)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T12:47:35.209Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msiwmdz1-l42k",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msiwmg9x-dfd0",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "New Lead"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Future Lead"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msiwmxxv-e8g6",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Future Lead"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msiwmg9x-dfd0",
    "from": "trigger_lead_updated-msiwmdz1-l42k"
   },
   {
    "to": "update_lead_field-msiwmxxv-e8g6",
    "from": "if_else-msiwmg9x-dfd0",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T12:20:30.139Z",
  "updatedAt": "2026-08-07T12:47:35.210Z",
  "deletedAt": null
 },
 {
  "id": "cmsix17sq009o2qeforadm1gg",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "New Lead(already Paid Customer)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T12:47:40.923Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msiwnlfs-4or3",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msiwnnpj-a6u6",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "New Lead"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Already Paid Customer"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msiwoir1-3but",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "New Lead"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msiwnnpj-a6u6",
    "from": "trigger_lead_updated-msiwnlfs-4or3"
   },
   {
    "to": "update_lead_field-msiwoir1-3but",
    "from": "if_else-msiwnnpj-a6u6",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T12:23:10.778Z",
  "updatedAt": "2026-08-07T12:47:40.924Z",
  "deletedAt": null
 },
 {
  "id": "cmsix26r6009p2qefg6kk3r4f",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "New Lead(Active Partner)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 3,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T12:47:46.606Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msiwqzgk-gvkn",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msiwr1kz-4fb8",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "New Lead"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Active Partner"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msiwrdz1-hgfv",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "New Lead"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msiwr1kz-4fb8",
    "from": "trigger_lead_updated-msiwqzgk-gvkn"
   },
   {
    "to": "update_lead_field-msiwrdz1-hgfv",
    "from": "if_else-msiwr1kz-4fb8",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T12:23:56.082Z",
  "updatedAt": "2026-08-08T05:04:19.516Z",
  "deletedAt": null
 },
 {
  "id": "cmsix3kb4009q2qef4cz71go7",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "New Lead (Inactive Partner)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T12:46:36.845Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msiws6sl-i0za",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msiws942-8m06",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "New Lead"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Inactive Partner"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msiwso80-l6x1",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "New Lead"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msiws942-8m06",
    "from": "trigger_lead_updated-msiws6sl-i0za"
   },
   {
    "to": "update_lead_field-msiwso80-l6x1",
    "from": "if_else-msiws942-8m06",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T12:25:00.304Z",
  "updatedAt": "2026-08-07T12:46:36.846Z",
  "deletedAt": null
 },
 {
  "id": "cmsixarob009r2qefx3lx2zc7",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Interested-FollowUp(Could not Connect)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T17:14:23.270Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msiwwgyt-g8fp",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msiwwnnx-c2pt",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Interested-FollowUp"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Could Not Connect"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msiwx8fj-9pux",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Not Connected(New Lead)"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msiwwnnx-c2pt",
    "from": "trigger_lead_updated-msiwwgyt-g8fp"
   },
   {
    "to": "update_lead_field-msiwx8fj-9pux",
    "from": "if_else-msiwwnnx-c2pt",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T12:30:36.443Z",
  "updatedAt": "2026-08-07T17:14:23.271Z",
  "deletedAt": null
 },
 {
  "id": "cmsixewkq009s2qefdom1s1gh",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Interested-FollowUp(Payment Link sent)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T17:14:29.412Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msix0jqb-9949",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msix0ltb-ft5i",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Interested-FollowUp"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Payment Link Sent"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msix10u4-8wjd",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Payment Link Sent"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msix0ltb-ft5i",
    "from": "trigger_lead_updated-msix0jqb-9949"
   },
   {
    "to": "update_lead_field-msix10u4-8wjd",
    "from": "if_else-msix0ltb-ft5i",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T12:33:49.419Z",
  "updatedAt": "2026-08-07T17:14:29.413Z",
  "deletedAt": null
 },
 {
  "id": "cmsiximzx009t2qefk175yvs9",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Interested-FollowUp(Interested-FollowUp)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T17:14:40.397Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msix4tha-j8u1",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msix4vu1-kn9p",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Interested-FollowUp"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Interested Followup"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msix5i8w-dzrf",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Interested-FollowUp"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msix4vu1-kn9p",
    "from": "trigger_lead_updated-msix4tha-j8u1"
   },
   {
    "to": "update_lead_field-msix5i8w-dzrf",
    "from": "if_else-msix4vu1-kn9p",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T12:36:43.629Z",
  "updatedAt": "2026-08-07T17:14:40.398Z",
  "deletedAt": null
 },
 {
  "id": "cmsixkt4w009u2qefrodndber",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Interested Followup(Not Interested (For making Payment)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T17:14:47.397Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msix8qqx-f5id",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msix8shb-8ivy",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Interested-FollowUp"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Not Interested (For Making Payment)"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msix9r61-br2p",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Not Interested"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msix8shb-8ivy",
    "from": "trigger_lead_updated-msix8qqx-f5id"
   },
   {
    "to": "update_lead_field-msix9r61-br2p",
    "from": "if_else-msix8shb-8ivy",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T12:38:24.897Z",
  "updatedAt": "2026-08-07T17:14:47.398Z",
  "deletedAt": null
 },
 {
  "id": "cmsixnmgs009v2qefggba7ii8",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Interested-FollowUp(Future Lead)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T17:14:53.227Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msixaix4-74ou",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msixaleh-db53",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Interested-FollowUp"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Future Lead"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msixcmra-igxx",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Future Lead"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msixaleh-db53",
    "from": "trigger_lead_updated-msixaix4-74ou"
   },
   {
    "to": "update_lead_field-msixcmra-igxx",
    "from": "if_else-msixaleh-db53",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T12:40:36.220Z",
  "updatedAt": "2026-08-07T17:14:53.228Z",
  "deletedAt": null
 },
 {
  "id": "cmsixp6er009w2qeff2t9p1lf",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Interested-FollowUp(Already Paid Customer)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T17:14:58.441Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msixdc02-dpqk",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msixddno-g77k",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Interested-FollowUp"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Already Paid Customer"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msixdtpy-fk3u",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Interested-FollowUp"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msixddno-g77k",
    "from": "trigger_lead_updated-msixdc02-dpqk"
   },
   {
    "to": "update_lead_field-msixdtpy-fk3u",
    "from": "if_else-msixddno-g77k",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T12:41:48.723Z",
  "updatedAt": "2026-08-07T17:14:58.443Z",
  "deletedAt": null
 },
 {
  "id": "cmsixqove009x2qefbomuuf8v",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Interested-FollowUp(Payment Done)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T17:14:34.613Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msixeyf5-5fvy",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msixf04l-fem9",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Interested-FollowUp"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Payment Done"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msixfvqz-4hjz",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Payment Done"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msixf04l-fem9",
    "from": "trigger_lead_updated-msixeyf5-5fvy"
   },
   {
    "to": "update_lead_field-msixfvqz-4hjz",
    "from": "if_else-msixf04l-fem9",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T12:42:59.306Z",
  "updatedAt": "2026-08-07T17:14:34.614Z",
  "deletedAt": null
 },
 {
  "id": "cmsixtzvx00a62qefl0gv0wrw",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Interested-FollowUp(Negotiation)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T17:14:17.158Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msixggbd-57wo",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msixhgwu-4pid",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Interested-FollowUp"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Negotiation"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msixj430-g7i4",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Negotiation"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msixhgwu-4pid",
    "from": "trigger_lead_updated-msixggbd-57wo"
   },
   {
    "to": "update_lead_field-msixj430-g7i4",
    "from": "if_else-msixhgwu-4pid",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T12:45:33.549Z",
  "updatedAt": "2026-08-07T17:14:17.159Z",
  "deletedAt": null
 },
 {
  "id": "cmsiz7ate00b82qefe0t728je",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Not Connected(Discussion Pending)(Disqualified)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T13:37:03.426Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msiyv7pu-g1d5",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msiyva5c-htqx",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Not Connected(Discussion Pending)"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Disqualified"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msiyw35f-b88g",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Disqualified"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msiyva5c-htqx",
    "from": "trigger_lead_updated-msiyv7pu-g1d5"
   },
   {
    "to": "update_lead_field-msiyw35f-b88g",
    "from": "if_else-msiyva5c-htqx",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T13:23:53.858Z",
  "updatedAt": "2026-08-07T13:37:03.427Z",
  "deletedAt": null
 },
 {
  "id": "cmsiz9ogi00b92qefl4fzoic1",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Not Connected(Discussion Pending)(Could not connect)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 32,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T13:37:00.952Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msiyx1ti-58wd",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msiyxgsc-6cqr",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Not Connected(Discussion Pending)"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Could Not Connect"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msiyygzk-jwr1",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Not Connected(Discussion Pending)"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msiyxgsc-6cqr",
    "from": "trigger_lead_updated-msiyx1ti-58wd"
   },
   {
    "to": "update_lead_field-msiyygzk-jwr1",
    "from": "if_else-msiyxgsc-6cqr",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T13:25:44.851Z",
  "updatedAt": "2026-08-08T13:49:26.329Z",
  "deletedAt": null
 },
 {
  "id": "cmsizba6t00ba2qef1o5sbty2",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Not Connected(Discussion Pending) (Discussion Pending)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T13:36:58.054Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msiyzg71-3vgn",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msiyzijj-9xz7",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Not Connected(Discussion Pending)"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Discussion Pending (Answered Calls)"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msiz0bwn-3dms",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Discussion Pending"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msiyzijj-9xz7",
    "from": "trigger_lead_updated-msiyzg71-3vgn"
   },
   {
    "to": "update_lead_field-msiz0bwn-3dms",
    "from": "if_else-msiyzijj-9xz7",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T13:26:59.669Z",
  "updatedAt": "2026-08-07T13:36:58.055Z",
  "deletedAt": null
 },
 {
  "id": "cmsize9fo00bb2qeftiuiqbqd",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Not Connected(Discussion Pending)(Demo scheduled)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T13:36:55.549Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msiz13e8-benp",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msiz1hnn-34ac",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Not Connected(Discussion Pending)"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Demo Scheduled"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msiz2zi1-cio2",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Demo Scheduled"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msiz1hnn-34ac",
    "from": "trigger_lead_updated-msiz13e8-benp"
   },
   {
    "to": "update_lead_field-msiz2zi1-cio2",
    "from": "if_else-msiz1hnn-34ac",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T13:29:18.661Z",
  "updatedAt": "2026-08-07T13:36:55.550Z",
  "deletedAt": null
 },
 {
  "id": "cmsizgl9p00bc2qefesjd33m9",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Not Connected(Discussion Pending)(Not Interested for scheduling Demo)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T13:36:52.849Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msiz3zuf-kdyk",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msiz41hy-1ht2",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Not Connected(Discussion Pending)"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Not Interested (For Scheduling Demo)"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msiz4srd-iaz5",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Not Interested"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msiz41hy-1ht2",
    "from": "trigger_lead_updated-msiz3zuf-kdyk"
   },
   {
    "to": "update_lead_field-msiz4srd-iaz5",
    "from": "if_else-msiz41hy-1ht2",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T13:31:07.310Z",
  "updatedAt": "2026-08-07T13:36:52.850Z",
  "deletedAt": null
 },
 {
  "id": "cmsizinrz00bd2qefxtclor3z",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Not Connected(Discussion Pending)(Interested Follow up Councelling )",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T13:36:47.113Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msiz6ch5-9gpg",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msiz6lvj-dztl",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Not Connected(Discussion Pending)"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Interested Followup Counselling"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msiz7dpa-48am",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Interested Followup Counselling"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msiz6lvj-dztl",
    "from": "trigger_lead_updated-msiz6ch5-9gpg"
   },
   {
    "to": "update_lead_field-msiz7dpa-48am",
    "from": "if_else-msiz6lvj-dztl",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T13:32:43.872Z",
  "updatedAt": "2026-08-07T13:36:47.114Z",
  "deletedAt": null
 },
 {
  "id": "cmsizkghz00be2qefcnstoawr",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Not Connected(Discussion Pending) (Future Lead)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T13:36:43.385Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msiz8jom-ig2v",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msiz8mnx-dfob",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Not Connected(Discussion Pending)"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Future Lead"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msiz9jvh-4ob3",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Future Lead"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msiz8mnx-dfob",
    "from": "trigger_lead_updated-msiz8jom-ig2v"
   },
   {
    "to": "update_lead_field-msiz9jvh-4ob3",
    "from": "if_else-msiz8mnx-dfob",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T13:34:07.752Z",
  "updatedAt": "2026-08-07T13:36:43.387Z",
  "deletedAt": null
 },
 {
  "id": "cmsiznl8b00bf2qefi1ku1j3i",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Not Connected(New Lead)(Disqualified)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 1,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T13:36:50.368Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msizbvkl-alih",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msizbyty-6ipv",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Not Connected(New Lead)"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Disqualified"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msizch61-347n",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Disqualified"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msizbyty-6ipv",
    "from": "trigger_lead_updated-msizbvkl-alih"
   },
   {
    "to": "update_lead_field-msizch61-347n",
    "from": "if_else-msizbyty-6ipv",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T13:36:33.851Z",
  "updatedAt": "2026-08-07T17:24:32.525Z",
  "deletedAt": null
 },
 {
  "id": "cmsizpuw100bg2qefd2r42u06",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Not Connected(New Lead)(Could Not Connect)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 5,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T13:57:21.023Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msize57z-df4j",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msize7ik-82aj",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Not Connected(New Lead)"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Could Not Connect"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msizey4u-90i1",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Not Connected(New Lead)"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msize7ik-82aj",
    "from": "trigger_lead_updated-msize57z-df4j"
   },
   {
    "to": "update_lead_field-msizey4u-90i1",
    "from": "if_else-msize7ik-82aj",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T13:38:19.682Z",
  "updatedAt": "2026-08-08T12:58:18.588Z",
  "deletedAt": null
 },
 {
  "id": "cmsizrgtv00bh2qefxvi0a36e",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Not Connected(New Lead)(Discussion Pending Answered Calls )",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T13:57:18.593Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msizfjzn-7q8s",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msizflhj-55cq",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Not Connected(New Lead)"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Discussion Pending (Answered Calls)"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msizg7ay-2lfp",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Discussion Pending"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msizflhj-55cq",
    "from": "trigger_lead_updated-msizfjzn-7q8s"
   },
   {
    "to": "update_lead_field-msizg7ay-2lfp",
    "from": "if_else-msizflhj-55cq",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T13:39:34.772Z",
  "updatedAt": "2026-08-07T13:57:18.594Z",
  "deletedAt": null
 },
 {
  "id": "cmsizsw8x00bi2qefkcz11075",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Not Connected(New Lead)(Demo scheduled)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 1,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T13:57:16.296Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msizhbvw-gw91",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msizhdkx-jg1p",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Not Connected(New Lead)"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Demo Scheduled"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msizi1df-65m6",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Demo Scheduled"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msizhdkx-jg1p",
    "from": "trigger_lead_updated-msizhbvw-gw91"
   },
   {
    "to": "update_lead_field-msizi1df-65m6",
    "from": "if_else-msizhdkx-jg1p",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T13:40:41.410Z",
  "updatedAt": "2026-08-08T05:05:11.447Z",
  "deletedAt": null
 },
 {
  "id": "cmsizzwhb00bj2qeful8xfns5",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Not Connected(New Lead)(Not Interested for Demo schedule)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T13:57:13.915Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msizl05h-ek12",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msizl2u2-ewtj",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Not Connected(New Lead)"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Not Interested (For Scheduling Demo)"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msiznbr4-h27k",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Not Interested"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msizl2u2-ewtj",
    "from": "trigger_lead_updated-msizl05h-ek12"
   },
   {
    "to": "update_lead_field-msiznbr4-h27k",
    "from": "if_else-msizl2u2-ewtj",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T13:46:08.303Z",
  "updatedAt": "2026-08-07T13:57:13.916Z",
  "deletedAt": null
 },
 {
  "id": "cmsj0bawr00bk2qef8jayplfv",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Not Connected(New Lead)(Interested Follow up)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T13:57:11.499Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msizywlv-5rgw",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msizze5z-2zw0",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Not Connected(New Lead)"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Interested Followup Counselling"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msj003h1-l3tx",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Interested-FollowUp"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msizze5z-2zw0",
    "from": "trigger_lead_updated-msizywlv-5rgw"
   },
   {
    "to": "update_lead_field-msj003h1-l3tx",
    "from": "if_else-msizze5z-2zw0",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T13:55:00.220Z",
  "updatedAt": "2026-08-07T13:57:11.500Z",
  "deletedAt": null
 },
 {
  "id": "cmsj0cot300bl2qef1vwxujkn",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Not Connected(New Lead)(future Lead)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T13:57:08.681Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msj0120u-44k6",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msj013ot-lcpd",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Not Connected(New Lead)"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Future Lead"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msj01nye-7lr9",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Future Lead"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msj013ot-lcpd",
    "from": "trigger_lead_updated-msj0120u-44k6"
   },
   {
    "to": "update_lead_field-msj01nye-7lr9",
    "from": "if_else-msj013ot-lcpd",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T13:56:04.888Z",
  "updatedAt": "2026-08-07T13:57:08.682Z",
  "deletedAt": null
 },
 {
  "id": "cmsj0g1hb00bm2qefniza9o9m",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Discussion Pending (Disqualified)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T16:16:17.321Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msj0444w-gfxm",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msj045wu-hjqp",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Discussion Pending"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Disqualified"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msj04zdv-fj76",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Disqualified"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msj045wu-hjqp",
    "from": "trigger_lead_updated-msj0444w-gfxm"
   },
   {
    "to": "update_lead_field-msj04zdv-fj76",
    "from": "if_else-msj045wu-hjqp",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T13:58:41.280Z",
  "updatedAt": "2026-08-07T16:16:17.323Z",
  "deletedAt": null
 },
 {
  "id": "cmsj0h6er00bn2qefblzxn7y9",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Discussion Pending (Could not Connect)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 31,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T16:16:12.924Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msj05sas-8l00",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msj05twe-3eu8",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Discussion Pending"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Could Not Connect"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msj06dbk-58ou",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Not Connected(Discussion Pending)"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msj05twe-3eu8",
    "from": "trigger_lead_updated-msj05sas-8l00"
   },
   {
    "to": "update_lead_field-msj06dbk-58ou",
    "from": "if_else-msj05twe-3eu8",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T13:59:34.323Z",
  "updatedAt": "2026-08-08T13:49:25.918Z",
  "deletedAt": null
 },
 {
  "id": "cmsj0jp1n00bo2qeffnh96c46",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Discussion Pending (Discussing Pending answered Calls)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 5,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T16:16:09.269Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msj06ysd-54ke",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msj0704s-6m9a",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Discussion Pending"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Discussion Pending (Answered Calls)"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msj07wf6-g6oa",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Discussion Pending"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msj0704s-6m9a",
    "from": "trigger_lead_updated-msj06ysd-54ke"
   },
   {
    "to": "update_lead_field-msj07wf6-g6oa",
    "from": "if_else-msj0704s-6m9a",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T14:01:31.787Z",
  "updatedAt": "2026-08-08T13:43:50.020Z",
  "deletedAt": null
 },
 {
  "id": "cmsj0m3do00bp2qefhm5hwwg7",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Discussion Pending (Demo Scheduled)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T16:16:05.157Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msj0ajgr-3edl",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msj0aniq-2gmo",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Discussion Pending"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Demo Scheduled"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msj0b9f4-7kk",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Demo Scheduled"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msj0aniq-2gmo",
    "from": "trigger_lead_updated-msj0ajgr-3edl"
   },
   {
    "to": "update_lead_field-msj0b9f4-7kk",
    "from": "if_else-msj0aniq-2gmo",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T14:03:23.677Z",
  "updatedAt": "2026-08-07T16:16:05.158Z",
  "deletedAt": null
 },
 {
  "id": "cmsj0o1sf00bq2qefeioczvia",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Discussion Pending(Interested Follow up Councelling )",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T16:16:01.475Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msj0by9l-86ti",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msj0c0g2-8dkl",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Discussion Pending"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Interested Followup Counselling"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msj0copa-b2q0",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Interested Followup Counselling"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msj0c0g2-8dkl",
    "from": "trigger_lead_updated-msj0by9l-86ti"
   },
   {
    "to": "update_lead_field-msj0copa-b2q0",
    "from": "if_else-msj0c0g2-8dkl",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T14:04:54.927Z",
  "updatedAt": "2026-08-08T07:51:06.479Z",
  "deletedAt": null
 },
 {
  "id": "cmsj0re1j00br2qefk36x4ay3",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Discussion Pending (Not Interested for scheduling demo)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T16:15:57.489Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msj0eap2-alhy",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msj0ecg9-laqq",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Discussion Pending"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Not Interested (For Scheduling Demo)"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msj0ff5a-1n2k",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Not Interested"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msj0ecg9-laqq",
    "from": "trigger_lead_updated-msj0eap2-alhy"
   },
   {
    "to": "update_lead_field-msj0ff5a-1n2k",
    "from": "if_else-msj0ecg9-laqq",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T14:07:30.775Z",
  "updatedAt": "2026-08-07T16:15:57.490Z",
  "deletedAt": null
 },
 {
  "id": "cmsj0tgm100bs2qef2v2w0l11",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Discussion Pending (Future lead)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 2,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T16:15:54.074Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msj0hlgc-5oj4",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msj0ho1k-kllo",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Discussion Pending"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Future Lead"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msj0ifgq-amwy",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Future Lead"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msj0ho1k-kllo",
    "from": "trigger_lead_updated-msj0hlgc-5oj4"
   },
   {
    "to": "update_lead_field-msj0ifgq-amwy",
    "from": "if_else-msj0ho1k-kllo",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T14:09:07.417Z",
  "updatedAt": "2026-08-08T13:15:18.652Z",
  "deletedAt": null
 },
 {
  "id": "cmsj1zbe200bt2qefm1q1eryc",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Demo Completed Demo Data(Unable to Sync)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T16:15:50.819Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msj1lm54-d20a",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msj1lo6z-3r2z",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Demo Completed Demo Data"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Unable to sync (Oracle user)"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msj1mhhh-37s5",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Disqualified"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msj1lo6z-3r2z",
    "from": "trigger_lead_updated-msj1lm54-d20a"
   },
   {
    "to": "update_lead_field-msj1mhhh-37s5",
    "from": "if_else-msj1lo6z-3r2z",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T14:41:40.203Z",
  "updatedAt": "2026-08-07T16:15:50.821Z",
  "deletedAt": null
 },
 {
  "id": "cmsj20v9q00bu2qef4lacjxll",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Demo Completed Demo Data(Could not Connect)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T16:15:46.747Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msj1p3tu-1v8p",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msj1p5we-ivhi",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Demo Completed Demo Data"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Could Not Connect"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msj1q2gd-fl2b",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Demo Completed Demo Data"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msj1p5we-ivhi",
    "from": "trigger_lead_updated-msj1p3tu-1v8p"
   },
   {
    "to": "update_lead_field-msj1q2gd-fl2b",
    "from": "if_else-msj1p5we-ivhi",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T14:42:52.622Z",
  "updatedAt": "2026-08-07T16:15:46.748Z",
  "deletedAt": null
 },
 {
  "id": "cmsj22reu00bv2qefrlku09yw",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Demo Completed Demo Data(Interested Follow up)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T16:15:44.120Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msj1qmvp-4n87",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msj1qpka-epoa",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Demo Completed Demo Data"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Interested Followup"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msj1r886-27f5",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Interested-FollowUp"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msj1qpka-epoa",
    "from": "trigger_lead_updated-msj1qmvp-4n87"
   },
   {
    "to": "update_lead_field-msj1r886-27f5",
    "from": "if_else-msj1qpka-epoa",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T14:44:20.934Z",
  "updatedAt": "2026-08-07T16:15:44.121Z",
  "deletedAt": null
 },
 {
  "id": "cmsj276sb00bw2qefaayik37i",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Demo Completed Demo Data(Not Interested (For making Payment)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T16:15:39.160Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msj1spqb-c11m",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msj1t7je-9emp",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Demo Completed Demo Data"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Not Interested (For Making Payment)"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msj1u5q5-cgar",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Not Interested"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msj1t7je-9emp",
    "from": "trigger_lead_updated-msj1spqb-c11m"
   },
   {
    "to": "update_lead_field-msj1u5q5-cgar",
    "from": "if_else-msj1t7je-9emp",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T14:47:47.483Z",
  "updatedAt": "2026-08-07T16:15:39.161Z",
  "deletedAt": null
 },
 {
  "id": "cmsj2f1vc00bx2qefgssx6u9k",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Demo Completed Demo Data(Future Lead)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T16:15:36.531Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msj1xnj8-9qxy",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msj21i6i-cg23",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Demo Completed Demo Data"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Future Lead"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msj22q76-1x4g",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Future Lead"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msj21i6i-cg23",
    "from": "trigger_lead_updated-msj1xnj8-9qxy"
   },
   {
    "to": "update_lead_field-msj22q76-1x4g",
    "from": "if_else-msj21i6i-cg23",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T14:53:54.359Z",
  "updatedAt": "2026-08-07T16:15:36.533Z",
  "deletedAt": null
 },
 {
  "id": "cmsj557ld00by2qef7w2n7sew",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Demo Completed Demo Data(Payment Done)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T16:15:33.914Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msj4t9xa-bmmv",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msj4tcpd-lq2",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Demo Completed Demo Data"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Payment Done"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msj4tykp-9ee0",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Payment Done"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msj4tcpd-lq2",
    "from": "trigger_lead_updated-msj4t9xa-bmmv"
   },
   {
    "to": "update_lead_field-msj4tykp-9ee0",
    "from": "if_else-msj4tcpd-lq2",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T16:10:14.065Z",
  "updatedAt": "2026-08-07T16:15:33.915Z",
  "deletedAt": null
 },
 {
  "id": "cmsj57f5u00bz2qefl8ngbqo6",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Demo Completed Demo Data(Negotiation)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T16:15:28.398Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msj4v4bu-cep7",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msj4v9a8-29ri",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Demo Completed Demo Data"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Negotiation"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msj4vrxp-fblk",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Negotiation"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msj4v9a8-29ri",
    "from": "trigger_lead_updated-msj4v4bu-cep7"
   },
   {
    "to": "update_lead_field-msj4vrxp-fblk",
    "from": "if_else-msj4v9a8-29ri",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T16:11:57.186Z",
  "updatedAt": "2026-08-07T16:15:28.400Z",
  "deletedAt": null
 },
 {
  "id": "cmsj5e6g500c02qefpkuqnxmf",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Not Connected(Demo Scheduled)(Unable to sync)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T16:56:07.347Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msj56eel-ie3d",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msj56gn6-42gn",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Not Connected(Demo Scheduled)"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Unable to sync (Oracle user)"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msj57v2c-5lje",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Disqualified"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msj56gn6-42gn",
    "from": "trigger_lead_updated-msj56eel-ie3d"
   },
   {
    "to": "update_lead_field-msj57v2c-5lje",
    "from": "if_else-msj56gn6-42gn",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T16:17:12.485Z",
  "updatedAt": "2026-08-07T16:56:07.348Z",
  "deletedAt": null
 },
 {
  "id": "cmsj5p1br00c12qefi0ig6mex",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Not Connected(Demo Scheduled) (Could not Connect)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T16:55:41.029Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msj5ctkz-j49n",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msj5cwsb-8igr",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Not Connected(Demo Scheduled)"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Could Not Connect"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msj5dk3x-bi3k",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Not Connected(Demo Scheduled)"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msj5cwsb-8igr",
    "from": "trigger_lead_updated-msj5ctkz-j49n"
   },
   {
    "to": "update_lead_field-msj5dk3x-bi3k",
    "from": "if_else-msj5cwsb-8igr",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T16:25:39.064Z",
  "updatedAt": "2026-08-07T16:55:41.031Z",
  "deletedAt": null
 },
 {
  "id": "cmsj5r93j00c22qef6hsuomqt",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Not Connected(Demo Scheduled) Demo completed demo data",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T16:55:38.332Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msj5ew4b-1w2y",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msj5eywb-d1vi",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Not Connected(Demo Scheduled)"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Demo Completed"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msj5fwh3-b1pd",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Demo Completed Demo Data"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msj5eywb-d1vi",
    "from": "trigger_lead_updated-msj5ew4b-1w2y"
   },
   {
    "to": "update_lead_field-msj5fwh3-b1pd",
    "from": "if_else-msj5eywb-d1vi",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T16:27:22.447Z",
  "updatedAt": "2026-08-07T16:55:38.334Z",
  "deletedAt": null
 },
 {
  "id": "cmsj5t42k00c32qef3wd3clw3",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Not Connected(Demo Scheduled) (Demo completed Demo syncing)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T16:55:31.858Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msj5h7bb-1vfk",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msj5h8wy-7lys",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Not Connected(Demo Scheduled)"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Demo Completed"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msj5hyxr-3f2h",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Demo Completed-demo Syncing"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msj5h8wy-7lys",
    "from": "trigger_lead_updated-msj5h7bb-1vfk"
   },
   {
    "to": "update_lead_field-msj5hyxr-3f2h",
    "from": "if_else-msj5h8wy-7lys",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T16:28:49.244Z",
  "updatedAt": "2026-08-07T16:55:31.860Z",
  "deletedAt": null
 },
 {
  "id": "cmsj5vazg00c42qef0om350uv",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Not Connected(Demo Scheduled)(Not Interested for demo done)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T16:55:34.432Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msj5j434-etzz",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msj5j680-ih48",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Not Connected(Demo Scheduled)"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Not Interested (For Demo Done)"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msj5k86k-2cgn",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Not Interested"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msj5j680-ih48",
    "from": "trigger_lead_updated-msj5j434-etzz"
   },
   {
    "to": "update_lead_field-msj5k86k-2cgn",
    "from": "if_else-msj5j680-ih48",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T16:30:31.516Z",
  "updatedAt": "2026-08-07T16:55:34.433Z",
  "deletedAt": null
 },
 {
  "id": "cmsj5yays00c52qefbq0ykbit",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Not Connected(Demo Scheduled)(call back demo schedule)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T16:55:29.348Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msj5mr17-fuje",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msj5mszh-dyj",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Not Connected(Demo Scheduled)"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Call Back (Demo Scheduled)"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msj5nb74-2eyr",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Demo Scheduled"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msj5mszh-dyj",
    "from": "trigger_lead_updated-msj5mr17-fuje"
   },
   {
    "to": "update_lead_field-msj5nb74-2eyr",
    "from": "if_else-msj5mszh-dyj",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T16:32:51.460Z",
  "updatedAt": "2026-08-07T16:55:29.349Z",
  "deletedAt": null
 },
 {
  "id": "cmsj5zspc00c62qefskajgmyx",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Not Connected(Demo Scheduled)(Demo reschedule)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T16:55:26.743Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msj5o9ki-cw5o",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msj5obgp-jzrj",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Not Connected(Demo Scheduled)"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Demo Rescheduled"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msj5ospd-516u",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Demo Scheduled"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msj5obgp-jzrj",
    "from": "trigger_lead_updated-msj5o9ki-cw5o"
   },
   {
    "to": "update_lead_field-msj5ospd-516u",
    "from": "if_else-msj5obgp-jzrj",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T16:34:01.104Z",
  "updatedAt": "2026-08-07T16:55:26.744Z",
  "deletedAt": null
 },
 {
  "id": "cmsj64p3p00c72qefxg5gtug0",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Not Connected(Demo Scheduled)(Future Lead)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T16:55:24.228Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msj5q0n7-y0y",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msj5q2g6-jaug",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Not Connected(Demo Scheduled)"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Future Lead"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msj5r0i7-e5ix",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Future Lead"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msj5q2g6-jaug",
    "from": "trigger_lead_updated-msj5q0n7-y0y"
   },
   {
    "to": "update_lead_field-msj5r0i7-e5ix",
    "from": "if_else-msj5q2g6-jaug",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T16:37:49.718Z",
  "updatedAt": "2026-08-07T16:55:24.229Z",
  "deletedAt": null
 },
 {
  "id": "cmsj6ixga00c82qefd9nsrl7b",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Not interested(Discussion pending answered calls)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T16:55:21.604Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msj64zji-keut",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msj6525r-1p11",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Not Interested"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Discussion Pending (Answered Calls)"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msj65t54-elss",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Discussion Pending"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msj6525r-1p11",
    "from": "trigger_lead_updated-msj64zji-keut"
   },
   {
    "to": "update_lead_field-msj65t54-elss",
    "from": "if_else-msj6525r-1p11",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T16:48:53.722Z",
  "updatedAt": "2026-08-07T16:55:21.605Z",
  "deletedAt": null
 },
 {
  "id": "cmsj6ksll00c92qef4jrztdyu",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Not Interested (Demo Scheduled)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T16:54:40.361Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msj68ros-cqyx",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msj68tug-96qu",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Not Interested"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Demo Scheduled"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msj69bwr-8pvz",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Demo Scheduled"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msj68tug-96qu",
    "from": "trigger_lead_updated-msj68ros-cqyx"
   },
   {
    "to": "update_lead_field-msj69bwr-8pvz",
    "from": "if_else-msj68tug-96qu",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T16:50:20.745Z",
  "updatedAt": "2026-08-07T16:54:40.362Z",
  "deletedAt": null
 },
 {
  "id": "cmsj6lwuk00ca2qef8jfi65ti",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Not Interested (Payment Done)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T16:54:36.809Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msj6alky-bj4j",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msj6aomk-f1d0",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Not Interested"
       ]
      },
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Payment Done"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msj6b6lo-l2x2",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Payment Done"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msj6aomk-f1d0",
    "from": "trigger_lead_updated-msj6alky-bj4j"
   },
   {
    "to": "update_lead_field-msj6b6lo-l2x2",
    "from": "if_else-msj6aomk-f1d0",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T16:51:12.908Z",
  "updatedAt": "2026-08-07T16:54:36.809Z",
  "deletedAt": null
 },
 {
  "id": "cmsj6nn1t00cb2qefyn4hrojr",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Not Interested (Already Paid Customer)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T16:54:34.415Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msj6c36c-eutw",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msj6c551-ha94",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Not Interested"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Already Paid Customer"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msj6cil0-kayk",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Not Interested"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msj6c551-ha94",
    "from": "trigger_lead_updated-msj6c36c-eutw"
   },
   {
    "to": "update_lead_field-msj6cil0-kayk",
    "from": "if_else-msj6c551-ha94",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T16:52:33.521Z",
  "updatedAt": "2026-08-07T16:54:34.416Z",
  "deletedAt": null
 },
 {
  "id": "cmsj6pcgo00cc2qefuuwum51t",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Not Interested (Active Partner)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T16:54:31.854Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msj6e0k0-hncf",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msj6e3d9-xtm",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Not Interested"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Active Partner"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msj6efks-jsgx",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Not Interested"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msj6e3d9-xtm",
    "from": "trigger_lead_updated-msj6e0k0-hncf"
   },
   {
    "to": "update_lead_field-msj6efks-jsgx",
    "from": "if_else-msj6e3d9-xtm",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T16:53:53.112Z",
  "updatedAt": "2026-08-07T16:54:31.855Z",
  "deletedAt": null
 },
 {
  "id": "cmsj7f5y200cd2qefjaimbia7",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Future Lead(Demo Scheduled)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 1,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T17:14:07.574Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msj6tsde-8odr",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msj6tu95-d3l6",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Future Lead"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Demo Scheduled"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msj73hcx-jpth",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Demo Scheduled"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msj6tu95-d3l6",
    "from": "trigger_lead_updated-msj6tsde-8odr"
   },
   {
    "to": "update_lead_field-msj73hcx-jpth",
    "from": "if_else-msj6tu95-d3l6",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T17:13:57.723Z",
  "updatedAt": "2026-08-07T17:31:56.745Z",
  "deletedAt": null
 },
 {
  "id": "cmsj7igat00ce2qefxcu0tn43",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Future Lead(Interested Follow-up)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T17:17:29.632Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msj76t36-7r8n",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msj76usd-7cu7",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Future Lead"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Interested Followup Counselling"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msj77ge6-hpxf",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Interested-FollowUp"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msj76usd-7cu7",
    "from": "trigger_lead_updated-msj76t36-7r8n"
   },
   {
    "to": "update_lead_field-msj77ge6-hpxf",
    "from": "if_else-msj76usd-7cu7",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T17:16:31.109Z",
  "updatedAt": "2026-08-07T17:17:29.633Z",
  "deletedAt": null
 },
 {
  "id": "cmsj7lipp00cf2qefn8pfwjrx",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Future lead (Disqualified)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T17:18:59.459Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msj79kwz-kcul",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msj79n2e-fv9w",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Future Lead"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Disqualified"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msj7a56i-67j7",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Disqualified"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msj79n2e-fv9w",
    "from": "trigger_lead_updated-msj79kwz-kcul"
   },
   {
    "to": "update_lead_field-msj7a56i-67j7",
    "from": "if_else-msj79n2e-fv9w",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T17:18:54.205Z",
  "updatedAt": "2026-08-07T17:18:59.460Z",
  "deletedAt": null
 },
 {
  "id": "cmsj7r1xe00cg2qefpwo04a3d",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Future Lead(Already Paid Customer )",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-07T17:23:19.134Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msj7brya-dvjo",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msj7c3vn-kbey",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Future Lead"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Already Paid Customer"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msj7fxhm-3hy0",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Future Lead"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msj7c3vn-kbey",
    "from": "trigger_lead_updated-msj7brya-dvjo"
   },
   {
    "to": "update_lead_field-msj7fxhm-3hy0",
    "from": "if_else-msj7c3vn-kbey",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-07T17:23:12.386Z",
  "updatedAt": "2026-08-07T17:23:19.136Z",
  "deletedAt": null
 },
 {
  "id": "cmsk15ta200fz2qef2do78lhe",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Interested-FollowUp (Active partner)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-08T07:07:41.786Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msk0u6q2-54kv",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msk0u9b1-k5sl",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Interested-FollowUp"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Active Partner"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msk0up0l-hdjg",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Interested-FollowUp"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msk0u9b1-k5sl",
    "from": "trigger_lead_updated-msk0u6q2-54kv"
   },
   {
    "to": "update_lead_field-msk0up0l-hdjg",
    "from": "if_else-msk0u9b1-k5sl",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-08T07:06:29.882Z",
  "updatedAt": "2026-08-08T07:07:41.787Z",
  "deletedAt": null
 },
 {
  "id": "cmsk176yg00g02qefenuaa46p",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Interested-FollowUp(Inactive Partner)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-08T07:07:39.147Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msk0vogr-hhzt",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msk0vu5p-2ma8",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Interested-FollowUp"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Inactive Partner"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msk0w8k6-b1ti",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Interested-FollowUp"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msk0vu5p-2ma8",
    "from": "trigger_lead_updated-msk0vogr-hhzt"
   },
   {
    "to": "update_lead_field-msk0w8k6-b1ti",
    "from": "if_else-msk0vu5p-2ma8",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-08T07:07:34.264Z",
  "updatedAt": "2026-08-08T07:07:39.148Z",
  "deletedAt": null
 },
 {
  "id": "cmsk29ypj00g12qefc1p1nb6c",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Not Connected (Interested Followup)(could Not connect)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-08T08:00:19.465Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msk1yiv8-6hw8",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msk1ykgk-ddu2",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Not Connected(Interested Followup)"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Could Not Connect"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msk1z13v-lc1c",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Not Connected(Interested Followup)"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msk1ykgk-ddu2",
    "from": "trigger_lead_updated-msk1yiv8-6hw8"
   },
   {
    "to": "update_lead_field-msk1z13v-lc1c",
    "from": "if_else-msk1ykgk-ddu2",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-08T07:37:43.159Z",
  "updatedAt": "2026-08-08T08:00:19.466Z",
  "deletedAt": null
 },
 {
  "id": "cmsk2binu00g22qefsmhr1cga",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Not Connected (Interested Followup)(Payment Link sent)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-08T08:00:17.112Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msk1zt0w-h9rt",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msk1zv2j-e91c",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Not Connected(Interested Followup)"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Payment Link Sent"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msk20dy2-9qif",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Not Connected(Interested Followup)"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msk1zv2j-e91c",
    "from": "trigger_lead_updated-msk1zt0w-h9rt"
   },
   {
    "to": "update_lead_field-msk20dy2-9qif",
    "from": "if_else-msk1zv2j-e91c",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-08T07:38:55.674Z",
  "updatedAt": "2026-08-08T08:00:17.113Z",
  "deletedAt": null
 },
 {
  "id": "cmsk2eavo00g32qefvf1ki25q",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Not Connected (Interested Followup) (Interested Follow up)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-08T08:00:14.152Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msk21et8-7e1q",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msk21gon-6al2",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Not Connected(Interested Followup)"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Interested Followup"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msk2208a-arfr",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Interested-FollowUp"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msk21gon-6al2",
    "from": "trigger_lead_updated-msk21et8-7e1q"
   },
   {
    "to": "update_lead_field-msk2208a-arfr",
    "from": "if_else-msk21gon-6al2",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-08T07:41:05.557Z",
  "updatedAt": "2026-08-08T08:00:14.153Z",
  "deletedAt": null
 },
 {
  "id": "cmsk2fwhi00g42qeft9qhuz27",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Not Connected (Interested Followup)( Not Interested for making Payments)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-08T08:00:11.929Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msk246mj-4yat",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msk24847-1jl",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Not Connected(Interested Followup)"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Not Interested (For Making Payment)"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msk25054-5aax",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Interested-FollowUp"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msk24847-1jl",
    "from": "trigger_lead_updated-msk246mj-4yat"
   },
   {
    "to": "update_lead_field-msk25054-5aax",
    "from": "if_else-msk24847-1jl",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-08T07:42:20.214Z",
  "updatedAt": "2026-08-08T08:00:11.930Z",
  "deletedAt": null
 },
 {
  "id": "cmsk2h94v00g52qefrbthwswn",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Not Connected (Interested Followup)(Future Lead)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-08T08:00:09.505Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msk25qbk-4m7l",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msk25s97-6yec",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Not Connected(Interested Followup)"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Future Lead"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msk26hrz-dv1i",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Future Lead"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msk25s97-6yec",
    "from": "trigger_lead_updated-msk25qbk-4m7l"
   },
   {
    "to": "update_lead_field-msk26hrz-dv1i",
    "from": "if_else-msk25s97-6yec",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-08T07:43:23.263Z",
  "updatedAt": "2026-08-08T08:00:09.506Z",
  "deletedAt": null
 },
 {
  "id": "cmsk2iggy00g62qefnfcqzut6",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Not Connected (Interested Followup)(Payment Done)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-08T08:00:07.134Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msk2760r-1zby",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msk277pz-5co8",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Not Connected(Interested Followup)"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Payment Done"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msk27qbl-efc1",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Payment Done"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msk277pz-5co8",
    "from": "trigger_lead_updated-msk2760r-1zby"
   },
   {
    "to": "update_lead_field-msk27qbl-efc1",
    "from": "if_else-msk277pz-5co8",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-08T07:44:19.426Z",
  "updatedAt": "2026-08-08T08:00:07.136Z",
  "deletedAt": null
 },
 {
  "id": "cmsk2jrok00g72qef4yxx1ot6",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Not Connected (Interested Followup)(Negotiation)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-08T08:00:04.865Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msk288ln-37rl",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msk28aes-24nc",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Not Connected(Interested Followup)"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Negotiation"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msk291rx-g88s",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Negotiation"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msk28aes-24nc",
    "from": "trigger_lead_updated-msk288ln-37rl"
   },
   {
    "to": "update_lead_field-msk291rx-g88s",
    "from": "if_else-msk28aes-24nc",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-08T07:45:20.613Z",
  "updatedAt": "2026-08-08T08:00:04.866Z",
  "deletedAt": null
 },
 {
  "id": "cmsk2li1i00g82qefg3aw0wxc",
  "tenantId": "cmpzc0bn70000a1xp642kgwmf",
  "name": "Not Connected (Interested Followup)(Already Paid Customer)",
  "status": "Active",
  "triggerSummary": null,
  "triggerType": "trigger_lead_updated",
  "scope": null,
  "triggerCount": 0,
  "externalId": null,
  "sourceSystem": null,
  "lastPublishedOn": "2026-08-08T08:00:02.318Z",
  "graphNodes": [
   {
    "id": "trigger_lead_updated-msk29jrc-4vtj",
    "kind": "trigger_lead_updated",
    "config": {}
   },
   {
    "id": "if_else-msk29mn1-7yu",
    "kind": "if_else",
    "config": {
     "connector": "AND",
     "conditions": [
      {
       "op": "in",
       "field": "stage",
       "value": [
        "Not Connected(Interested Followup)"
       ]
      },
      {
       "op": "in",
       "field": "status",
       "value": [
        "Already Paid Customer"
       ]
      }
     ]
    }
   },
   {
    "id": "update_lead_field-msk2a37h-2p94",
    "kind": "update_lead_field",
    "config": {
     "field": "stage",
     "value": "Not Connected(Interested Followup)"
    }
   }
  ],
  "graphEdges": [
   {
    "to": "if_else-msk29mn1-7yu",
    "from": "trigger_lead_updated-msk29jrc-4vtj"
   },
   {
    "to": "update_lead_field-msk2a37h-2p94",
    "from": "if_else-msk29mn1-7yu",
    "branch": "true"
   }
  ],
  "createdAt": "2026-08-08T07:46:41.430Z",
  "updatedAt": "2026-08-08T08:00:02.319Z",
  "deletedAt": null
 }
] as any[];

async function main() {
  const existing = await prisma.qcfWorkflowDefinition.count({ where: { orgId: ORG_ID } });
  if (existing > 0) {
    console.error(`\u26a0\ufe0f  ${existing} workflow(s) already exist for this org. Aborting to avoid duplicates.`);
    process.exit(1);
  }

  let n = 0;
  await prisma.$transaction(async (tx) => {
    for (const r of ROWS) {
      await tx.qcfWorkflowDefinition.create({
        data: {
          id: r.id,
          orgId: ORG_ID,
          name: r.name,
          status: r.status,                 // "Active"
          triggerType: r.triggerType,       // "trigger_lead_updated"
          triggerSummary: r.triggerSummary ?? null,
          scope: r.scope ?? null,
          graphNodes: r.graphNodes,
          graphEdges: r.graphEdges,
          externalId: r.externalId ?? null,
          sourceSystem: r.sourceSystem ?? null,
          lastPublishedOn: r.lastPublishedOn ? new Date(r.lastPublishedOn) : null,
          triggerCount: 0,
        },
      });
      n++;
    }
  }, { timeout: 60_000 });

  console.log(`\u2705  Ported ${n} Active workflow rules to org ${ORG_ID}`);
  console.log("   triggerType=trigger_lead_updated, status=Active, triggerCount reset to 0.");
  console.log("   To fire: Redis up + worker running (npm run worker), app on the same DB.");
}

main()
  .catch((e) => { console.error("\u274c  failed:", e instanceof Error ? e.message : e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });