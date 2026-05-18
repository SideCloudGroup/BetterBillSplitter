<?php

use think\migration\Migrator;

class AddArchivedAtToParty extends Migrator
{
    public function up(): void
    {
        $table = $this->table('party');
        $table->addColumn('archived_at', 'datetime', [
            'null' => true,
            'default' => null,
        ])
            ->addIndex(['archived_at'])
            ->update();
    }

    public function down(): void
    {
        $table = $this->table('party');
        if ($table->hasColumn('archived_at')) {
            $table->removeColumn('archived_at')->update();
        }
    }
}
