select id, title, readOnly, modOnly
  from boards
  where id = $1
