SELECT
  t.sticky, t.board, t.postCtr, t.imageCtr, t.replyTime, t.bumpTime, t.subject,
  t.id, p.time, p.auth, p.body, p.links, p.commands,
  i.*
FROM threads t
JOIN posts p ON t.id = p.id
LEFT JOIN LATERAL (SELECT file_hash FROM post_files WHERE post_id = t.id ORDER BY id LIMIT 1) pf ON true
LEFT JOIN images i ON i.sha1 = pf.file_hash
WHERE t.board = $1
ORDER BY sticky DESC, bumpTime DESC
