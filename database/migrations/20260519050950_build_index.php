<?php

use think\migration\Migrator;

/**
 * 补齐业务查询常用索引（已有索引见各表创建迁移，此处不重复添加）.
 *
 * 已有索引摘要：
 * - party: invite_code(uk), owner_id, archived_at
 * - party_member: (party_id,user_id)(uk), party_id, user_id
 * - item: party_id
 * - currencies: code(uk), is_default, is_active
 * - refresh_tokens: user_id, token_hash(uk)
 */
class BuildIndex extends Migrator
{
    public function change(): void
    {
        // 登录 / 注册 / 资料：按 username；WebAuthn：按 uuid
        $this->table('user')
            ->addIndex(['username'], ['unique' => true, 'name' => 'uk_user_username'])
            ->addIndex(['uuid'], ['unique' => true, 'name' => 'uk_user_uuid'])
            ->update();

        // getSetting / updateSetting：按 key
        $this->table('setting')
            ->addIndex(['key'], ['unique' => true, 'name' => 'uk_setting_key'])
            ->update();

        // MFA 列表与校验：userid+type；WebAuthn/FIDO：rawid+type
        $this->table('mfa_credential')
            ->addIndex(['userid', 'type'], ['name' => 'idx_mfa_userid_type'])
            ->addIndex(['rawid', 'type'], ['name' => 'idx_mfa_rawid_type'])
            ->update();

        // 派对内未付项、按成员/发起人汇总、管理端活跃度统计
        $this->table('item')
            ->addIndex(['party_id', 'paid'], ['name' => 'idx_item_party_paid'])
            ->addIndex(['party_id', 'userid', 'paid'], ['name' => 'idx_item_party_userid_paid'])
            ->addIndex(['party_id', 'initiator', 'paid'], ['name' => 'idx_item_party_initiator_paid'])
            ->addIndex(['userid', 'paid'], ['name' => 'idx_item_userid_paid'])
            ->addIndex(['initiator', 'paid'], ['name' => 'idx_item_initiator_paid'])
            ->addIndex(['created_at'], ['name' => 'idx_item_created_at'])
            ->update();

        // 所有者派对列表；管理端按基础货币统计
        $this->table('party')
            ->addIndex(['owner_id', 'archived_at'], ['name' => 'idx_party_owner_archived'])
            ->addIndex(['base_currency'], ['name' => 'idx_party_base_currency'])
            ->update();

        // 按用户吊销 refresh；按过期时间清理
        $this->table('refresh_tokens')
            ->addIndex(['user_id', 'revoked_at'], ['name' => 'idx_refresh_user_revoked'])
            ->addIndex(['expires_at'], ['name' => 'idx_refresh_expires_at'])
            ->update();
    }
}
