#!/bin/bash
set -euo pipefail
umask 077

backup_dir=/var/backups/product-workbench
install -d -m 700 "$backup_dir"
backup_file="$backup_dir/friend_product_workbench-$(date +%Y%m%d-%H%M%S).sql.gz"

# Send the project credential through stdin, never through arguments or logs.
docker exec -i mysql84 sh -c 'IFS= read -r MYSQL_PWD; export MYSQL_PWD; exec mysqldump --user=friend_dev --host=127.0.0.1 --single-transaction --no-tablespaces --set-gtid-purged=OFF --hex-blob --routines --triggers --events friend_product_workbench' < /etc/product-workbench/mysql_password.txt | gzip > "$backup_file.partial"
gzip -t "$backup_file.partial"
mv "$backup_file.partial" "$backup_file"
printf 'Backup completed: %s\n' "$backup_file"
