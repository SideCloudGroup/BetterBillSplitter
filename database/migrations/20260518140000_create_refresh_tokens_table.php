<?php

use think\migration\Migrator;

class CreateRefreshTokensTable extends Migrator
{
    public function up(): void
    {
        $table = $this->table('refresh_tokens', ['engine' => 'InnoDB', 'collation' => 'utf8mb4_unicode_ci']);
        $table->addColumn('user_id', 'integer', ['null' => false])
            ->addColumn('token_hash', 'string', ['limit' => 64, 'null' => false])
            ->addColumn('expires_at', 'datetime', ['null' => false])
            ->addColumn('revoked_at', 'datetime', ['null' => true])
            ->addColumn('replaced_by', 'integer', ['null' => true, 'default' => null])
            ->addColumn('created_ip', 'string', ['limit' => 45, 'null' => true])
            ->addColumn('user_agent', 'string', ['limit' => 512, 'null' => true])
            ->addIndex(['user_id'])
            ->addIndex(['token_hash'], ['unique' => true])
            ->create();
    }

    public function down(): void
    {
        $this->table('refresh_tokens')->drop()->save();
    }
}
