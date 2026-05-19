<?php

declare (strict_types=1);

namespace app\command;

use app\model\User;
use Exception;
use Ramsey\Uuid\Uuid;
use think\console\Command;
use think\console\Input;
use think\console\input\Argument;
use think\console\Output;

class CreateAdmin extends Command
{
    protected function configure()
    {
        $this->setName('createAdmin')
            ->setDescription('创建管理员用户')
            ->addArgument('username', Argument::REQUIRED, '管理员用户名')
            ->addArgument('password', Argument::REQUIRED, '管理员密码');
    }

    protected function execute(Input $input, Output $output)
    {
        $username = $input->getArgument('username');
        $password = $input->getArgument('password');

        $output->writeln("正在创建管理员用户: {$username}");

        // 检查用户是否已存在
        $existingUser = User::where('username', $username)->find();
        if ($existingUser) {
            $output->error("用户 $username 已存在！请使用其他用户名。");
            return false;
        }

        try {
            // 创建新用户
            $user = new User();
            $user->username = $username;
            $user->password = password_hash($password, PASSWORD_ARGON2ID);
            $user->uuid = Uuid::uuid4()->toString();
            $user->is_admin = 1; // 设置为管理员
            $user->save();

            $output->writeln("<info>管理员用户 {$username} 创建成功！</info>");
            $output->writeln("用户ID: {$user->id}");
            $output->writeln("UUID: {$user->uuid}");
            $output->writeln("管理员权限: 是");

            return true;
        } catch (Exception $e) {
            $output->error("创建管理员用户失败: " . $e->getMessage());
            return false;
        }
    }
}
