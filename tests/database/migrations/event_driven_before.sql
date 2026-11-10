-- Seed only the runner's disposable database before the forward migration.
insert into auth.users(id, email) values('73737373-7373-4373-8373-737373737373', 'migration-pause@example.invalid');
set role service_role;
select public.configure_planning_schedule('73737373-7373-4373-8373-737373737373', now());
select public.defer_planning('73737373-7373-4373-8373-737373737373', 'subscription_required', 300);
reset role;
