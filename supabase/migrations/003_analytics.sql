-- Etap 7: statystyki porównawcze pojazdów dla zadanego okresu (p_from = NULL -> cały okres).
-- SECURITY INVOKER: RLS działa, użytkownik widzi tylko swoje pojazdy.
create or replace function public.vehicle_analytics(p_from date default null)
returns table (
  vehicle_id uuid, make text, model text, plate text, current_mileage int, purchase_price numeric,
  total_expenses numeric, fuel_expenses numeric, km_driven int, cost_per_km numeric,
  avg_l_per_100km numeric, fuel_cost_per_100km numeric
)
language sql stable security invoker set search_path = public as $$
  with v as (select * from public.vehicles where archived_at is null),
  ex as (
    select e.vehicle_id, sum(e.amount) as total, sum(e.amount) filter (where e.category = 'fuel') as fuel
      from public.expenses e where p_from is null or e.spent_at >= p_from group by e.vehicle_id),
  km as (
    select v.id as vehicle_id,
           v.current_mileage - coalesce(
             case when p_from is not null then
               (select m.mileage from public.mileage_logs m where m.vehicle_id = v.id and m.recorded_at < p_from
                 order by m.recorded_at desc, m.mileage desc limit 1) end,
             (select min(m.mileage) from public.mileage_logs m where m.vehicle_id = v.id)) as driven
      from v),
  fe as (
    select f.vehicle_id, sum(f.liters) as l, sum(f.distance_km) as d, sum(f.cost) as c
      from public.v_fuel_efficiency f where p_from is null or f.end_date >= p_from group by f.vehicle_id)
  select v.id, v.make, v.model, v.plate, v.current_mileage, v.purchase_price,
         coalesce(ex.total, 0), coalesce(ex.fuel, 0), greatest(km.driven, 0)::int,
         case when km.driven > 0 and coalesce(ex.total, 0) > 0 then round(ex.total / km.driven, 3) end,
         case when fe.d > 0 then round(fe.l / fe.d * 100, 2) end,
         case when fe.d > 0 then round(fe.c / fe.d * 100, 2) end
    from v left join ex on ex.vehicle_id = v.id join km on km.vehicle_id = v.id left join fe on fe.vehicle_id = v.id
   order by v.created_at;
$$;
