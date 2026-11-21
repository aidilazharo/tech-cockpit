# ServiceNow APM sample exports (`apm/`)

Synthetic samples (20 records per file) from the product owner's Node export application, analysed 2026-10-22. Values were sanitised by AI, so many choice values are wrong and names are not always consistent between files. **Field names and sys_ids are reliable.** Decisions taken from this analysis are in [requirements-decisions.md §2](../requirements-decisions.md).

## How the files link

```
business_capability  (3 levels in real data; parent = name of the parent; empty parent = top level)
        ▲ u_capability_category_group (top) → u_capability_family (middle) → u_capability_category (lowest)
        │
business_application ──(relationship)──► application service ──(relationship)──► business service
                                                │
                                                ├──(relationship)──► server            (names only)
                                                │
                                                └──(software link)──► software model ──u_product_standard──► product_standard
```

| File | Content | Key | Links to |
|---|---|---|---|
| `business_application.json` | Business applications (276 fields, ~94 used) | `sys_id`, `number` | capabilities by name (3 fields) |
| `mapped_application_service.json` | Application services, one per deployment/environment | `sys_id` | — |
| `business_service.json` | Exported from the parent services table: business services **and** application services (9 of 20 share sys_ids with the application-service file) | `sys_id`; type by `sys_class_name` | — |
| `business_capability.json` | Capability tree: `parent`, `hierarchy_level` (from 0), `leaf_node` | `sys_id`, `name` | parent by name |
| `product_standard.json` | Technology standards list (29 fields) | `sys_id`, `u_product_standard` | — |
| `ba_as_sm.json` | Joined view, one row per application + relationship + application service + software link + software model. Field prefixes: `ba_`, `rel_`, `app_`, `sw_`, `sm_` | sys_ids of every part | applications match `business_application.json` by sys_id |
| `ba_as_bs.json` | Path: application → application service → business service (`u_business_application_1`, `u_mapped_application_service_1`, `u_business_service_1`) | **names only** | by name |
| `ba_as_server.json` | Path: application → application service → server (`u_server_1`) | **names only** | by name |

In the path files, `query` and `count` come from the export run, and the `u_rel_*` columns describe the relationship rows; the entity columns carry the names to match.

## Main fields per entity

- **Business application.**
  - Identity: `name`, `number`, `u_display_name`, `u_short_name`, `short_description`.
  - Status: `install_status` (Implementing / In Production / Retired), `operational_status`, `u_ba_record_status`.
  - People: `it_application_owner`, `u_application_lead`, `u_application_manager`.
  - Organisation: `business_unit`, `u_owned_business_unit`, `u_serving_business_units`, `u_group_or_local`.
  - Resilience: `u_application_criticality_rating`, `u_application_bcm_criticality`, `u_business_application_rto` / `_rpo`, `u_recovery_time_capability` (a time such as `01:30`).
  - Technical: `install_type`, `u_has_api`, `u_data_encryption`, `u_network_facing`.
  - Related applications: `u_depending_applications`, `u_relating_applications`.
  - **Financial**: annual costs in thousands of USD: `u_annual_license_cost_k_usd`, `u_annual_internal_support_cost_k_usd`, `u_annual_external_support_cost_k_usd`, `u_annual_infra_cost_on_premises_k_usd`, `u_annual_infra_cost_cloud_k_usd`. These must be classified financial: vendors never see them.
- **Application service.** `name`, `number`, `environment` / `used_for` (Production, DR, UAT, Development, Test), `u_hosting_provider`, `u_apm_status`, `operational_status`, `service_classification`.
- **Business service.**
  - Identity and ownership: `name`, `number`, `owned_by`, `service_classification`, `portfolio_status`, `busines_criticality` (spelt so in ServiceNow).
  - Data protection: `u_data_classification`, `u_customer_pii_data`, `u_credit_card_data`, `u_healthcare_data`, `u_price_sensitive_data`.
  - Exposure and recovery: `u_network_facing`, `u_recovery_time_objective`, `u_recovery_point_objective`, `u_application_security_rating`.
- **Software model** (`sm_*` in `ba_as_sm`). `name`, `product`, `version`, `manufacturer`, `sw_product_type`, `u_product_model_category`, `u_product_standard`. The software link (`sw_*`) carries `software_model`, `business_service` (the application service), `full_version`, `primary_model`.
- **Product standard.**
  - Product: `u_product_standard`, `u_product`, `u_manufacturer`.
  - Status and categories: **`u_status` (Standard / Restricted)**, `u_standard_category`, `u_functional_category`.
  - Hosting: `u_cloud_service_saas_paas_native`, `u_vm_prem` / `u_vm_cloud`, `u_containerized_prem` / `u_containerized_cloud`, `u_allowed_on_desktop`.
  - Controls: `u_ai_features_approved_functions_and_control_requirements`.

## Notes for the sync

- Dates arrive as display text `DD-MM-YYYY HH:mm:ss` (a ServiceNow user setting). Parse them explicitly, or request raw values.
- Several fields that the TRM research proposed as TRM-only already exist in ServiceNow: lifecycle (`install_status`), criticality, RTO/RPO and technology standard status (`u_status`). These come in through the sync as read-only fields.
- In the sample, application-service and business-service names differ between files even for the same sys_id, and the application capability fields do not follow the capability tree. Both are sanitisation artefacts; name matching is verified against real data.
