/* Portfolio health · slim Redash query (optional, faster)
   Same sources and definitions as query 1455 ("Farid accounts health"), but only the
   columns the dashboard uses and no per-user / per-project arrays. Column names match
   query 1455, so the app works with either: save this as a new Redash query and set
   REDASH_QUERY_ID to its id. */
WITH
MyOrgs AS (
    SELECT DISTINCT org_id
    FROM pp_product_analytics.mapping_ls_zoho_org_mapping_master
    WHERE org_id IS NOT NULL AND org_id != '' AND paid_flag = 1
),
KamName AS (
    SELECT k.org_id AS org_id, any(s.name) AS kam_name
    FROM (
        SELECT org_id, argMax(kam_email, inserted_timestamp) AS kam_email
        FROM pp_retool_analytics_dev.kam_map
        GROUP BY org_id
    ) k
    LEFT JOIN pp_retool_analytics_dev.success_team_map s ON s.email_id = k.kam_email
    GROUP BY k.org_id
),
ZohoName AS (
    SELECT org_id, argMax(org_name, end_date) AS org_name
    FROM pp_product_analytics.mapping_ls_zoho_org_mapping_master
    WHERE org_id IN (SELECT org_id FROM MyOrgs)
    GROUP BY org_id
),
SubWindow AS (
    SELECT org_id, formatDateTime(dt_end, '%Y-%m-%d') AS map_sub_end_date
    FROM (
        SELECT org_id,
               parseDateTimeBestEffortOrNull(toString(end_date)) AS dt_end,
               row_number() OVER (PARTITION BY org_id ORDER BY parseDateTimeBestEffortOrNull(toString(end_date)) DESC) AS rw
        FROM pp_product_analytics.mapping_ls_zoho_org_mapping_master
        WHERE org_id IN (SELECT org_id FROM MyOrgs)
    )
    WHERE rw = 1 AND dt_end IS NOT NULL
),
UserCounts AS (
    SELECT org_id, COUNT(user_id) AS total_users
    FROM pp_ic_bi_product_analytics.usertoorgs
    WHERE org_id IN (SELECT org_id FROM MyOrgs)
    GROUP BY org_id
),
CompanyValues AS (
    SELECT org_id,
           max(if(valuee = 'V1', modulee, NULL)) AS v1_module, max(if(valuee = 'V1', training_stage, NULL)) AS v1_training_stage,
           max(if(valuee = 'V2', modulee, NULL)) AS v2_module, max(if(valuee = 'V2', training_stage, NULL)) AS v2_training_stage,
           max(if(valuee = 'V3', modulee, NULL)) AS v3_module, max(if(valuee = 'V3', training_stage, NULL)) AS v3_training_stage,
           max(if(valuee = 'V4', modulee, NULL)) AS v4_module, max(if(valuee = 'V4', training_stage, NULL)) AS v4_training_stage,
           max(if(valuee = 'V5', modulee, NULL)) AS v5_module, max(if(valuee = 'V5', training_stage, NULL)) AS v5_training_stage,
           max(if(valuee = 'V6', modulee, NULL)) AS v6_module, max(if(valuee = 'V6', training_stage, NULL)) AS v6_training_stage
    FROM (
        SELECT org_id, valuee, modulee, training_stage,
               ROW_NUMBER() OVER (PARTITION BY org_id, valuee ORDER BY inserted_timestamp DESC) AS rnk
        FROM pp_retool_analytics_dev.ob_company_values
        WHERE valuee IN ('V1','V2','V3','V4','V5','V6') AND org_id IN (SELECT org_id FROM MyOrgs)
    ) WHERE rnk = 1
    GROUP BY org_id
),
LastSuccess AS (
    SELECT org_id, toDate(maxIf(inserted_timestamp, disposition_type = 'Success')) AS last_successful_contact
    FROM pp_retool_analytics_dev.call_disposition
    WHERE user_id != 'USR289696600578' AND trainer NOT IN ('Admin','Saikutty')
      AND org_id IN (SELECT org_id FROM MyOrgs)
    GROUP BY org_id
),
OrgStatusTable AS (
    SELECT org_id, argMax(org_status, inserted_timestamp) AS org_status_actual, max(inserted_timestamp) AS org_status_ts
    FROM pp_retool_analytics_dev.org_status
    WHERE org_id IN (SELECT org_id FROM MyOrgs)
    GROUP BY org_id
),
KamForm AS (
    SELECT org_id, argMax(org_status, inserted_timestamp) AS org_status, max(inserted_timestamp) AS kam_form_ts
    FROM pp_retool_analytics_dev.kam_form_new
    WHERE org_id IN (SELECT org_id FROM MyOrgs)
    GROUP BY org_id
),
Tasks AS (
    SELECT org_id,
           countIf((task_completed = 0 OR task_completed IS NULL) AND due_date IS NOT NULL AND due_date < today()) AS overdue_tasks
    FROM pp_retool_analytics_dev.assigned_tasks
    WHERE org_id IN (SELECT org_id FROM MyOrgs)
    GROUP BY org_id
),
Activity AS (
    SELECT org_id,
           countDistinctIf(user_id,    event_date BETWEEN today() - 6  AND today()) AS active_users_l7,
           countDistinctIf(project_id, event_date BETWEEN today() - 29 AND today()) AS active_projects_l30,
           sumIf(event_count, event_date BETWEEN today() - 6  AND today())          AS events_l7,
           sumIf(event_count, event_date BETWEEN today() - 13 AND today() - 7)      AS events_prev_l7,
           sumIf(event_count, event_date BETWEEN today() - 13 AND today())          AS events_l14
    FROM pp_souvik_analytics.pp_activity_core_events_silver_raw
    WHERE org_id IN (SELECT org_id FROM MyOrgs)
      AND event_type = 'IG'
      AND project_id IS NOT NULL AND project_id != ''
      AND event_date BETWEEN today() - 29 AND today()
      AND user_id NOT IN (SELECT DISTINCT user_id FROM pp_product_analytics.mapping_internal_user_details)
    GROUP BY org_id
),
Payment AS (
    SELECT
        org_id,
        (CASE WHEN countIf(payment_rank = 1 AND actual_end_date >= today()) > 0 THEN 'Active'
              WHEN countIf(payment_rank = 1 AND actual_end_date < today() - INTERVAL 60 DAY) > 0 THEN 'Churned/Inactive'
              ELSE 'Grace Period' END) AS finance_status,
        max(if(payment_rank = 1, formatDateTime(toDateTime(actual_end_date), '%Y-%m-%d'), NULL)) AS fin_renewal_date,
        max(if(payment_rank = 1, Final_ten_ARR, NULL)) AS latest_ten_arr,
        sum(if(actual_end_date >= today(), Final_ten_ARR, 0)) AS active_ten_arr,
        if(argMax(tenure, payment_rank) > 3, 'DS',
           if(argMax(payment_rank, payment_rank) = 1 AND argMax(tenure, payment_rank) < 3, 'Pilot', 'P2S')) AS subscription
    FROM (
        SELECT *,
               addDays(addMonths(actual_start_date, tenure), -1) AS actual_end_date,
               (((total * exchange_rate) / (tenure)) * 12) AS Final_ten_ARR,
               row_number() OVER (PARTITION BY org_id ORDER BY actual_start_date DESC) AS payment_rank
        FROM (
            SELECT org_id, new_start AS actual_start_date,
                   max(exchange_rate) AS exchange_rate, sum(total) AS total, max(tenure) AS tenure
            FROM (
                SELECT b.org_id, invoice_number, new_start, exchange_rate, total, tenure
                FROM (
                    SELECT *,
                           if(toDate(cf_subscription_start) = toDate('1970-01-01'), invoice_date, cf_subscription_start) AS new_start,
                           ROW_NUMBER() OVER (PARTITION BY invoice_number ORDER BY updated_dt DESC) AS rn
                    FROM pp_financial_analytics.gold_invoice_subscription
                    WHERE notes NOT LIKE '%Marketplace%' AND notes NOT LIKE '%Greenply%'
                      AND customer_name NOT LIKE '%B2C Customer%' AND customer_name NOT LIKE '%Powerplay%' AND customer_name NOT LIKE '%Test%'
                      AND SUBSTRING(hsn_or_sac, 1, 2) != '69' AND item_desc NOT LIKE '%Round off%'
                      AND invoice_status IN ('paid','overdue') AND actual_amount > 0 AND end_date IS NOT NULL AND tenure > 0
                ) a
                LEFT JOIN pp_product_analytics.mapping_ls_zoho_org_mapping_master b ON a.customer_id = b.zoho_id
                WHERE rn = 1 AND b.org_id IN (SELECT org_id FROM MyOrgs)
            )
            GROUP BY org_id, new_start
        )
    )
    GROUP BY org_id
),
Jira AS (
    SELECT org_id,
           countDistinctIf(ticked_id, project_name = 'DIB'  AND (resolution_at IS NULL OR resolution_at = '')) AS dib_open,
           countDistinctIf(ticked_id, project_name = 'BRB'  AND (resolution_at IS NULL OR resolution_at = '')) AS brb_open,
           countDistinctIf(ticked_id, project_name = 'PSTD' AND priority_for_user IN ('critical','Blocker') AND (resolution_at IS NULL OR resolution_at = '')) AS pstd_open
    FROM (
        SELECT replaceAll(replaceAll(replaceAll(org_id, '[', ''), ']', ''), '''', '') AS org_id,
               ticked_id, project_name, resolution_at, priority_for_user
        FROM pp_jira_business_analytics.jira_transformed_v2
    )
    WHERE org_id IN (SELECT org_id FROM MyOrgs)
    GROUP BY org_id
)
SELECT
    m.org_id                                                       AS org_id,
    coalesce(zn.org_name, '')                                      AS org_name,
    coalesce(kn.kam_name, '')                                      AS kam_name,
    p.finance_status                                               AS org_status_finance,
    coalesce(
        nullIf(multiIf(
            los.org_status_ts IS NOT NULL AND kf.kam_form_ts IS NOT NULL,
                if(los.org_status_ts >= kf.kam_form_ts, los.org_status_actual, kf.org_status),
            los.org_status_ts IS NOT NULL, los.org_status_actual,
            kf.kam_form_ts IS NOT NULL,    kf.org_status,
            ''), ''),
        nullIf(los.org_status_actual, ''), nullIf(kf.org_status, ''), nullIf(p.finance_status, ''), '—') AS org_status_actual,
    coalesce(sw.map_sub_end_date, p.fin_renewal_date)              AS renewal_date,
    dateDiff('day', today(), toDate(coalesce(sw.map_sub_end_date, p.fin_renewal_date))) AS days_to_renewal,
    p.latest_ten_arr                                               AS latest_ten_arr,
    p.active_ten_arr                                               AS active_ten_arr,
    coalesce(uc.total_users, 0)                                    AS total_users,
    coalesce(a.active_users_l7, 0)                                 AS l7_active_user,
    coalesce(a.active_projects_l30, 0)                             AS l30_active_project,
    coalesce(a.events_l7, 0)                                       AS new_l7_ig,
    coalesce(a.events_prev_l7, 0)                                  AS prev_l7_ig,
    multiIf(coalesce(a.events_l14, 0) > 50, 'Good Activity', coalesce(a.events_l14, 0) >= 1, 'Low Activity', 'Inactive') AS activity_status,
    multiIf(coalesce(a.events_l7, 0) > coalesce(a.events_prev_l7, 0), 'Increased',
            coalesce(a.events_l7, 0) < coalesce(a.events_prev_l7, 0), 'Decreased', 'Unchanged') AS activity_comparison,
    cv.v1_module, cv.v1_training_stage, cv.v2_module, cv.v2_training_stage, cv.v3_module, cv.v3_training_stage,
    cv.v4_module, cv.v4_training_stage, cv.v5_module, cv.v5_training_stage, cv.v6_module, cv.v6_training_stage,
    if(ls.last_successful_contact <= toDate('1970-01-01'), NULL, toString(ls.last_successful_contact)) AS latest_successful_contact_date,
    coalesce(t.overdue_tasks, 0)                                   AS overdue_tasks_count,
    coalesce(j.dib_open, 0)                                        AS dib_open,
    coalesce(j.brb_open, 0)                                        AS brb_open,
    coalesce(j.pstd_open, 0)                                       AS pstd_open,
    p.subscription                                                 AS subs_type
FROM MyOrgs m
LEFT JOIN KamName        kn  ON kn.org_id  = m.org_id
LEFT JOIN ZohoName       zn  ON zn.org_id  = m.org_id
LEFT JOIN Payment        p   ON p.org_id   = m.org_id
LEFT JOIN SubWindow      sw  ON sw.org_id  = m.org_id
LEFT JOIN UserCounts     uc  ON uc.org_id  = m.org_id
LEFT JOIN Activity       a   ON a.org_id   = m.org_id
LEFT JOIN CompanyValues  cv  ON cv.org_id  = m.org_id
LEFT JOIN LastSuccess    ls  ON ls.org_id  = m.org_id
LEFT JOIN OrgStatusTable los ON los.org_id = m.org_id
LEFT JOIN KamForm        kf  ON kf.org_id  = m.org_id
LEFT JOIN Tasks          t   ON t.org_id   = m.org_id
LEFT JOIN Jira           j   ON j.org_id   = m.org_id
WHERE p.finance_status IN ('Active', 'Grace Period')
ORDER BY days_to_renewal
