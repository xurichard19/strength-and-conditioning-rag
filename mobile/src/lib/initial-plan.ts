import type { PlanningSchedule } from '@/services/backend';

export function initialPlanPending(schedule: PlanningSchedule | null) {
  return schedule?.initial_plan_status === 'queued' || schedule?.initial_plan_status === 'running'
    || schedule?.initial_plan_status === 'deferred';
}
