import unittest
from datetime import date, timedelta
from uuid import UUID

from app.contracts import (
    CalendarRecords, ClaimedReplanJob, OnboardingResponseRecord, PlannedExercise, PlannedExerciseSet,
    PlannedWorkout, PlanningDayDecision, PlanningProposal, PlanningScheduleRecord, ProfileRecord,
    ReplanContext, ReplanJobRecord, SportsWorkoutRecord, WorkoutRecord,
)
from app.services.planning import MAX_PRESCRIPTION_ERRORS, validate_proposal, workout_has_results


OWNER = UUID(int=1)
WORKOUT_ID = UUID(int=2)
NOW = "2026-09-22T12:00:00Z"
DAY = date(2026, 9, 22)
END = DAY + timedelta(days=20)


def prescription(day=DAY, name="strength"):
    return PlannedWorkout(name=name, scheduled_date=day, exercises=[PlannedExercise(name="squat", weight_unit="kg",
        sets=[PlannedExerciseSet(planned_reps=5, planned_weight=40)])])


def record(planned=None, workout_id=WORKOUT_ID):
    data = (planned or prescription()).model_dump()
    for exercise_index, exercise in enumerate(data["exercises"]):
        exercise_id = UUID(int=100 + exercise_index)
        exercise.update(id=exercise_id, workout_id=workout_id, order_index=exercise_index, created_at=NOW, updated_at=NOW)
        for set_index, item in enumerate(exercise["sets"]):
            item.update(id=UUID(int=200 + set_index), exercise_id=exercise_id, order_index=set_index,
                created_at=NOW, updated_at=NOW)
    return WorkoutRecord(**data, id=workout_id, user_id=OWNER, created_by_change_id=UUID(int=3),
        created_at=NOW, updated_at=NOW)


def inputs(kind="adjustment", workouts=None, sports=None):
    job = ReplanJobRecord(id=UUID(int=4), user_id=OWNER, kind=kind, status="running", reason="rolling update",
        deduplication_key="test", effective_from=DAY if kind == "adjustment" else None,
        effective_through=END if kind == "adjustment" else None, available_at=NOW, expected_revision=5,
        lease_token=UUID(int=5), claimed_on=DAY, created_at=NOW, updated_at=NOW)
    claim = ClaimedReplanJob(job=job, effective_from=DAY, effective_through=END, horizon_end=END)
    context = ReplanContext(schedule=PlanningScheduleRecord(user_id=OWNER, horizon_days=21, refresh_interval_days=7, horizon_end=END if kind == "adjustment"
        else DAY - timedelta(days=1), next_refresh_at=NOW, revision=5, created_at=NOW, updated_at=NOW),
        profile=ProfileRecord(id=OWNER, created_at=NOW, updated_at=NOW), onboarding=None, recent_workouts=[],
        calendar=CalendarRecords(workouts=workouts or [], sports_workouts=sports or []))
    return claim, context


def proposal(workouts=None, before=None, active_days=()):
    return PlanningProposal(before_ids=before or [], workouts=workouts or [],
        day_decisions=[PlanningDayDecision(scheduled_date=DAY + timedelta(days=index),
            rest=DAY + timedelta(days=index) not in active_days) for index in range((END - DAY).days + 1)])


def invalid_prescriptions():
    workouts = [prescription(), prescription(DAY + timedelta(days=1))]
    workouts[0].exercises[0].weight_unit = None
    workouts[0].exercises.append(PlannedExercise(name="side plank", reps_per_side=True,
        sets=[PlannedExerciseSet(planned_duration_seconds=30) for _ in range(2)]))
    workouts[1].exercises[0].sets[0].planned_reps = None
    workouts[1].exercises[0].sets.append(PlannedExerciseSet())
    return workouts


class PlanningValidationTests(unittest.TestCase):
    def test_initial_21_days_and_weekly_seven_day_extension(self):
        claim, context = inputs("refresh")
        context.schedule.horizon_end = None
        initial = proposal([prescription()], active_days=[DAY])
        self.assertEqual(len(validate_proposal(claim, context, initial).day_decisions), 21)

        context.schedule.horizon_end = DAY + timedelta(days=13)
        context.calendar.workouts = [record()]
        claim.effective_from = DAY + timedelta(days=14)
        added = prescription(claim.effective_from)
        extension = PlanningProposal(before_ids=[], workouts=[added], day_decisions=[
            PlanningDayDecision(scheduled_date=claim.effective_from + timedelta(days=index), rest=index != 0)
            for index in range(7)])
        result = validate_proposal(claim, context, extension)
        self.assertEqual(len(result.day_decisions), 7)
        self.assertEqual(result.before_ids, [])

    def test_refresh_appends_and_accounts_for_rest_without_rows(self):
        claim, context = inputs("refresh", workouts=[record(prescription(DAY - timedelta(days=1)))])
        result = validate_proposal(claim, context, proposal([prescription()], active_days=[DAY]))
        self.assertEqual(len(result.workouts), 1)
        self.assertEqual(result.before_ids, [])
        self.assertEqual([decision.rest for decision in result.day_decisions], [False] + [True] * 20)

    def test_refresh_cannot_replace_or_generate_inside_existing_coverage(self):
        claim, context = inputs("refresh", workouts=[record()])
        with self.assertRaisesRegex(ValueError, "preserve all"):
            validate_proposal(claim, context, proposal(before=[WORKOUT_ID], active_days=[DAY]))
        context.schedule.horizon_end = DAY
        with self.assertRaisesRegex(ValueError, "after existing coverage"):
            validate_proposal(claim, context, proposal())

    def test_rest_only_extension_and_empty_refresh_are_valid(self):
        claim, context = inputs("refresh")
        self.assertEqual(validate_proposal(claim, context, proposal()).workouts, [])
        context.schedule.horizon_end = END
        claim.effective_from = END + timedelta(days=1)
        empty = PlanningProposal(before_ids=[], workouts=[], day_decisions=[])
        self.assertEqual(validate_proposal(claim, context, empty), empty)
        with self.assertRaisesRegex(ValueError, "each date"):
            validate_proposal(claim, context, proposal())

    def test_identical_replacement_preserves_version_and_does_not_mutate_proposal(self):
        current = record()
        claim, context = inputs(workouts=[current])
        submitted = proposal([prescription()], [WORKOUT_ID], [DAY])
        result = validate_proposal(claim, context, submitted)
        self.assertEqual(result.before_ids, [])
        self.assertEqual(result.workouts, [])
        self.assertEqual(submitted.before_ids, [WORKOUT_ID])
        self.assertEqual(len(submitted.workouts), 1)

    def test_unused_units_are_cleared_without_mutation_or_unnecessary_replacement(self):
        for target, unit, value in (("planned_weight", "weight_unit", "kg"),
                ("planned_distance", "distance_unit", "km")):
            with self.subTest(unit=unit):
                planned = prescription()
                setattr(planned.exercises[0], unit, None)
                for item in planned.exercises[0].sets:
                    setattr(item, target, None)
                current = record(planned)
                setattr(planned.exercises[0], unit, value)
                submitted = proposal([planned], active_days=[DAY])
                original = submitted.model_dump()
                result = validate_proposal(*inputs(), submitted)
                self.assertIsNone(getattr(result.workouts[0].exercises[0], unit))
                expected = submitted.model_dump()
                expected["workouts"][0]["exercises"][0][unit] = None
                self.assertEqual(result.model_dump(), expected)
                submitted.before_ids = [WORKOUT_ID]
                unchanged = validate_proposal(*inputs(workouts=[current]), submitted)
                self.assertEqual((unchanged.before_ids, unchanged.workouts), ([], []))
                submitted.before_ids = []
                self.assertEqual(submitted.model_dump(), original)

    def test_normalization_respects_stored_exercise_and_set_order(self):
        planned = prescription()
        planned.exercises[0].sets.append(PlannedExerciseSet(planned_reps=8, planned_weight=30))
        planned.exercises.append(PlannedExercise(name="plank", sets=[PlannedExerciseSet(planned_duration_seconds=30)]))
        current = record(planned)
        current.exercises[0].sets.reverse()
        current.exercises.reverse()
        claim, context = inputs(workouts=[current])
        result = validate_proposal(claim, context, proposal([planned], [WORKOUT_ID], [DAY]))
        self.assertEqual((result.before_ids, result.workouts), ([], []))

    def test_changed_replacement_and_explicit_deletion_remain_changes(self):
        claim, context = inputs(workouts=[record()])
        changed = prescription()
        changed.exercises[0].sets[0].planned_reps = 6
        result = validate_proposal(claim, context, proposal([changed], [WORKOUT_ID], [DAY]))
        self.assertEqual(result.before_ids, [WORKOUT_ID])
        self.assertEqual(result.workouts[0].exercises[0].sets[0].planned_reps, 6)
        deleted = validate_proposal(claim, context, proposal(before=[WORKOUT_ID]))
        self.assertEqual(deleted.before_ids, [WORKOUT_ID])

    def test_training_days_only_fence_actual_additions_with_valid_preferences(self):
        for answers in (None, {}, {"trainingDays": None}, {"trainingDays": []}, {"trainingDays": "Mon"},
                {"trainingDays": ["Monday"]}, {"trainingDays": ["Mon", 2]}, {"trainingDays": ["Mon", []]},
                {"trainingDays": ["Tue"]}, {"trainingDays": ["Mon", "Thu"]}):
            with self.subTest(answers=answers):
                claim, context = inputs()
                if answers is not None:
                    context.onboarding = OnboardingResponseRecord(user_id=OWNER, answers=answers,
                        created_at=NOW, updated_at=NOW)
                submitted = proposal([prescription()], active_days=[DAY])
                if answers == {"trainingDays": ["Mon", "Thu"]}:
                    with self.assertRaisesRegex(ValueError, f"{DAY}.*Mon, Thu"):
                        validate_proposal(claim, context, submitted)
                else:
                    self.assertEqual(validate_proposal(claim, context, submitted), submitted)

        for status in ("planned", "completed"):
            with self.subTest(preserved=status):
                current = record()
                current.status = status
                claim, context = inputs(workouts=[current])
                context.onboarding = OnboardingResponseRecord(user_id=OWNER, answers={"trainingDays": ["Mon"]},
                    created_at=NOW, updated_at=NOW)
                self.assertEqual(validate_proposal(claim, context, proposal(active_days=[DAY])).workouts, [])
                if status == "planned":
                    unchanged = validate_proposal(claim, context, proposal([prescription()], [WORKOUT_ID], [DAY]))
                    self.assertEqual((unchanged.before_ids, unchanged.workouts), ([], []))
                    changed = proposal([prescription(name="new session")], [WORKOUT_ID], [DAY])
                    with self.assertRaisesRegex(ValueError, "available training day"):
                        validate_proposal(claim, context, changed)
                context.calendar.workouts = []
                context.calendar.sports_workouts = [SportsWorkoutRecord(id=UUID(int=6), user_id=OWNER,
                    sport="boxing", scheduled_date=DAY, created_at=NOW, updated_at=NOW)]
                self.assertEqual(validate_proposal(claim, context, proposal(active_days=[DAY])).workouts, [])

    def test_edit_ids_and_dates_must_be_current_unique_and_in_scope(self):
        for ids in ([UUID(int=999)], [WORKOUT_ID, WORKOUT_ID]):
            with self.subTest(ids=ids), self.assertRaises(ValueError):
                validate_proposal(*inputs(workouts=[record()]), proposal(before=ids))
        for day in (DAY - timedelta(days=1), END + timedelta(days=1)):
            with self.subTest(day=day), self.assertRaisesRegex(ValueError, "allowed window"):
                validate_proposal(*inputs(), proposal([prescription(day)]))
            with self.subTest(existing_day=day), self.assertRaisesRegex(ValueError, "editable current"):
                validate_proposal(*inputs(workouts=[record(prescription(day))]), proposal(before=[WORKOUT_ID]))
        current = record()
        current.superseded_at = NOW
        with self.assertRaisesRegex(ValueError, "current workouts"):
            validate_proposal(*inputs(workouts=[current]), proposal(before=[WORKOUT_ID]))

    def test_all_workout_and_set_results_block_removal(self):
        patches = [({}, {field: value}) for field, value in (("actual_reps", 0), ("actual_weight", 0),
            ("actual_distance", 0), ("actual_duration_seconds", 0), ("actual_rpe", 1), ("result_notes", ""),
            ("completed_at", NOW), ("result_status", "skipped"), ("result_status", "completed"))]
        patches.extend(({field: value}, {}) for field, value in (("status", "skipped"), ("status", "in_progress"),
            ("status", "completed"), ("started_at", NOW), ("completed_at", NOW), ("skipped_at", NOW)))
        self.assertFalse(workout_has_results(record()))
        for workout_fields, set_fields in patches:
            with self.subTest(workout=workout_fields, result=set_fields):
                current = record()
                for field, value in workout_fields.items():
                    setattr(current, field, value)
                for field, value in set_fields.items():
                    setattr(current.exercises[0].sets[0], field, value)
                self.assertTrue(workout_has_results(current))
                with self.assertRaisesRegex(ValueError, "editable current"):
                    validate_proposal(*inputs(workouts=[current]), proposal(before=[WORKOUT_ID]))

    def test_coverage_rejects_missing_duplicate_and_extra_dates(self):
        for days in ([DAY, END], [DAY, DAY, END], [DAY, DAY + timedelta(days=1), END + timedelta(days=1)]):
            with self.subTest(days=days), self.assertRaisesRegex(ValueError, "exactly one"):
                submitted = proposal()
                submitted.day_decisions = [PlanningDayDecision(scheduled_date=day, rest=True) for day in days]
                validate_proposal(*inputs(), submitted)

    def test_empty_day_decisions_derive_exact_coverage_without_mutating_inputs(self):
        protected = record()
        protected.status = "completed"
        removed = record(prescription(DAY + timedelta(days=1)), UUID(int=8))
        unchanged = prescription(DAY + timedelta(days=2))
        added = prescription(DAY + timedelta(days=3))
        sports = [SportsWorkoutRecord(id=UUID(int=6 + index), user_id=OWNER, sport="boxing",
            scheduled_date=DAY + timedelta(days=4 + index), status=status, created_at=NOW, updated_at=NOW)
            for index, status in enumerate(("planned", "cancelled"))]
        claim, context = inputs(workouts=[protected, removed, record(unchanged, UUID(int=9)),
            record(prescription(DAY - timedelta(days=1)), UUID(int=10))], sports=sports)
        submitted = PlanningProposal(before_ids=[removed.id, UUID(int=9)], workouts=[unchanged, added], day_decisions=[])
        original, original_context = submitted.model_dump(), context.model_dump()
        result = validate_proposal(claim, context, submitted)
        active_days = {DAY + timedelta(days=index) for index in (0, 2, 3, 4)}
        self.assertEqual(result.day_decisions, [PlanningDayDecision(scheduled_date=day, rest=day not in active_days)
            for day in (DAY + timedelta(days=index) for index in range(21))])
        self.assertEqual((result.before_ids, result.workouts), ([removed.id], [added]))
        self.assertEqual(submitted.model_dump(), original)
        self.assertEqual(context.model_dump(), original_context)

    def test_rest_matches_preserved_workouts_and_non_cancelled_sports(self):
        with self.assertRaisesRegex(ValueError, "rest decisions"):
            validate_proposal(*inputs(workouts=[record()]), proposal())
        with self.assertRaisesRegex(ValueError, "rest decisions"):
            validate_proposal(*inputs(), proposal(active_days=[DAY]))
        for status in ("planned", "completed", "cancelled"):
            with self.subTest(status=status):
                sport = SportsWorkoutRecord(id=UUID(int=6), user_id=OWNER, sport="running", scheduled_date=DAY,
                    status=status, created_at=NOW, updated_at=NOW)
                submitted = proposal(active_days=[] if status == "cancelled" else [DAY])
                self.assertEqual(validate_proposal(*inputs(sports=[sport]), submitted), submitted)

    def test_identical_additions_rejected_but_different_sessions_same_day_allowed(self):
        with self.assertRaisesRegex(ValueError, "duplicate another session"):
            validate_proposal(*inputs(), proposal([prescription(), prescription()], active_days=[DAY]))
        with self.assertRaisesRegex(ValueError, "duplicate another session"):
            validate_proposal(*inputs(workouts=[record()]), proposal([prescription()], active_days=[DAY]))
        submitted = proposal([prescription(), prescription(name="evening strength")], active_days=[DAY])
        self.assertEqual(len(validate_proposal(*inputs(), submitted).workouts), 2)
        with self.assertRaisesRegex(ValueError, "duplicate another session"):
            validate_proposal(*inputs(workouts=[record()]), proposal([prescription(), prescription()], [WORKOUT_ID], [DAY]))

    def test_context_owner_revision_and_horizon_are_fenced(self):
        for field in ("profile", "schedule", "onboarding", "calendar", "recent_workouts", "sports"):
            with self.subTest(field=field):
                claim, context = inputs()
                if field == "profile":
                    context.profile.id = UUID(int=99)
                elif field == "schedule":
                    context.schedule.user_id = UUID(int=99)
                elif field == "onboarding":
                    context.onboarding = OnboardingResponseRecord(user_id=UUID(int=99), created_at=NOW, updated_at=NOW)
                elif field == "sports":
                    context.calendar.sports_workouts = [SportsWorkoutRecord(id=UUID(int=9), user_id=UUID(int=99),
                        sport="running", scheduled_date=DAY, created_at=NOW, updated_at=NOW)]
                else:
                    current = record()
                    current.user_id = UUID(int=99)
                    if field == "calendar":
                        context.calendar.workouts = [current]
                    else:
                        context.recent_workouts = [current]
                with self.assertRaisesRegex(ValueError, "claimed athlete"):
                    validate_proposal(claim, context, proposal())
        claim, context = inputs()
        context.schedule.revision += 1
        with self.assertRaisesRegex(ValueError, "revision"):
            validate_proposal(claim, context, proposal())
        claim, context = inputs()
        claim.horizon_end += timedelta(days=1)
        with self.assertRaisesRegex(ValueError, "preserve coverage"):
            validate_proposal(claim, context, proposal())

    def test_claim_date_prevents_past_edits_and_claimed_horizon_bounds_changes(self):
        claim, context = inputs()
        claim.job.claimed_on = DAY + timedelta(days=1)
        with self.assertRaisesRegex(ValueError, "claimed local date"):
            validate_proposal(claim, context, proposal())
        claim, context = inputs()
        claim.effective_through += timedelta(days=1)
        with self.assertRaisesRegex(ValueError, "claimed horizon"):
            validate_proposal(claim, context, proposal())

    def test_sport_change_can_replace_training_without_changing_coverage(self):
        sport = SportsWorkoutRecord(id=UUID(int=6), user_id=OWNER, sport="soccer", scheduled_date=DAY,
            intensity="hard", created_at=NOW, updated_at=NOW)
        claim, context = inputs(workouts=[record()], sports=[sport])
        moved = prescription(DAY + timedelta(days=2), name="lighter strength")
        moved.exercises[0].sets[0].planned_weight = 30
        result = validate_proposal(claim, context, proposal([moved], [WORKOUT_ID], [DAY, moved.scheduled_date]))
        self.assertEqual(result.before_ids, [WORKOUT_ID])
        self.assertEqual(result.workouts, [moved])
        self.assertEqual(context.calendar.sports_workouts, [sport])
        self.assertEqual(claim.horizon_end, context.schedule.horizon_end)

    def test_empty_names_exercises_sets_and_targetless_sets_are_rejected(self):
        mutations = [lambda workout: setattr(workout, "name", " "),
            lambda workout: setattr(workout, "exercises", []),
            lambda workout: setattr(workout.exercises[0], "name", " "),
            lambda workout: setattr(workout.exercises[0], "sets", []),
            lambda workout: setattr(workout.exercises[0].sets[0], "planned_reps", None)]
        for mutate in mutations:
            with self.subTest(mutation=mutate), self.assertRaises(ValueError):
                planned = prescription()
                mutate(planned)
                validate_proposal(*inputs(), proposal([planned], active_days=[DAY]))

    def test_units_finite_targets_and_repetitions_per_side_are_consistent(self):
        mutations = [lambda exercise: setattr(exercise, "weight_unit", None),
            lambda exercise: setattr(exercise.sets[0], "planned_distance", 2),
            lambda exercise: setattr(exercise.sets[0], "planned_weight", float("inf")),
            lambda exercise: setattr(exercise.sets[0], "planned_weight", float("nan"))]
        for mutate in mutations:
            with self.subTest(mutation=mutate), self.assertRaises(ValueError):
                planned = prescription()
                mutate(planned.exercises[0])
                validate_proposal(*inputs(), proposal([planned], active_days=[DAY]))
        for target, unit, value, amount in (("planned_weight", "weight_unit", "kg", 0),
                ("planned_distance", "distance_unit", "km", 2)):
            for unit_value in (value, None):
                with self.subTest(target=target, unit=unit_value):
                    planned = prescription()
                    setattr(planned.exercises[0].sets[0], target, None)
                    planned.exercises[0].sets.append(PlannedExerciseSet(planned_reps=5))
                    setattr(planned.exercises[0].sets[-1], target, amount)
                    setattr(planned.exercises[0], unit, unit_value)
                    submitted = proposal([planned], active_days=[DAY])
                    if unit_value is None:
                        with self.assertRaisesRegex(ValueError, unit):
                            validate_proposal(*inputs(), submitted)
                    else:
                        self.assertEqual(validate_proposal(*inputs(), submitted), submitted)
        planned = prescription()
        planned.exercises = [PlannedExercise(name="hold", reps_per_side=True,
            sets=[PlannedExerciseSet(planned_duration_seconds=30)])]
        with self.assertRaisesRegex(ValueError, "repetitions per side"):
            validate_proposal(*inputs(), proposal([planned], active_days=[DAY]))

    def test_prescription_error_limit_reports_omissions_without_unbounded_feedback(self):
        planned = prescription()
        planned.exercises[0].weight_unit = None
        planned.exercises[0].sets = [PlannedExerciseSet() for _ in range(MAX_PRESCRIPTION_ERRORS + 10)]
        with self.assertRaises(ValueError) as caught:
            validate_proposal(*inputs(), proposal([planned], active_days=[DAY]))
        feedback = str(caught.exception)
        self.assertIn("additional prescription errors omitted", feedback)
        self.assertEqual(feedback.count("workouts[0].exercises[0].sets["), MAX_PRESCRIPTION_ERRORS)
        self.assertNotIn(f"sets[{MAX_PRESCRIPTION_ERRORS}]", feedback)
        self.assertLessEqual(len(feedback), 4000)

    def test_permission_fences_precede_prescription_feedback(self):
        for invalid, expected in (("owner", "claimed athlete"), ("revision", "revision"),
                ("protected", "editable current"), ("date", "allowed window")):
            with self.subTest(invalid=invalid):
                claim, context = inputs(workouts=[record()])
                submitted = proposal(invalid_prescriptions(), active_days=[DAY, DAY + timedelta(days=1)])
                if invalid == "owner":
                    context.profile.id = UUID(int=99)
                elif invalid == "revision":
                    context.schedule.revision += 1
                elif invalid == "protected":
                    context.calendar.workouts[0].exercises[0].sets[0].actual_reps = 0
                    submitted.before_ids = [WORKOUT_ID]
                else:
                    submitted.workouts[-1].scheduled_date = END + timedelta(days=1)
                with self.assertRaisesRegex(ValueError, expected) as caught:
                    validate_proposal(claim, context, submitted)
                self.assertNotIn("weight_unit", str(caught.exception))

    def test_separate_left_and_right_timed_exercises_need_no_repetition_targets(self):
        planned = prescription()
        planned.exercises = [PlannedExercise(name=f"side plank - {side}",
            sets=[PlannedExerciseSet(planned_duration_seconds=30)]) for side in ("left", "right")]
        submitted = proposal([planned], active_days=[DAY])
        self.assertEqual(validate_proposal(*inputs(), submitted), submitted)


if __name__ == "__main__":
    unittest.main()
