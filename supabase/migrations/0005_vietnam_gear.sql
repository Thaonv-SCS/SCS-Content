-- Thêm 2 ngăn: vietnam (ĐTQG, V-League, cầu thủ Việt Nam) và gear (bóng & phụ kiện).

alter table sources drop constraint sources_category_hint_check;
alter table sources add constraint sources_category_hint_check
  check (category_hint in ('boots', 'player', 'event', 'kits', 'vietnam', 'gear', 'match', 'mixed'));

alter table stories drop constraint stories_category_check;
alter table stories add constraint stories_category_check
  check (category in ('boots', 'player', 'event', 'kits', 'vietnam', 'gear', 'discard'));

alter table suggestions drop constraint suggestions_slot_check;
alter table suggestions add constraint suggestions_slot_check
  check (slot in ('boots', 'player', 'event', 'kits', 'vietnam', 'gear'));

alter table captions drop constraint captions_category_check;
alter table captions add constraint captions_category_check
  check (category in ('boots', 'player', 'event', 'kits', 'vietnam', 'gear', 'other'));
