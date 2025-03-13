

const { ethers } = require('ethers');
const chalk = require('chalk');
const figlet = require('figlet');
const ora = require('ora');
const toml = require('toml');
const fs = require('fs');
const inquirer = require('inquirer');

const BALANCE_THRESHOLD = 0.001;      // 余额阈值 (TESTNET MONAD)
const DEFAULT_ATTEMPTS = 10000000;    // 默认尝试次数
const GAS_LIMIT = 200000;             // Gas 限制

async function showGameModeMenu() {
    const { mode } = await inquirer.prompt([
        {
            type: 'list',
            name: 'mode',
            message: chalk.cyan('🎮 选择游戏模式:'),
            choices: [
                {
                    name: '🤖 自动模式',
                    value: 'automatic'
                },
                {
                    name: '🎯 手动模式',
                    value: 'manual'
                },
                {
                    name: '🚪 退出游戏',
                    value: 'exit'
                }
            ],
            pageSize: 3
        }
    ]);
    return mode;
}

async function getManualSettings() {
    const answers = await inquirer.prompt([
        {
            type: 'input',
            name: 'attempts',
            message: chalk.cyan(`请输入尝试次数 (回车使用默认值 ${DEFAULT_ATTEMPTS}):`),
            default: DEFAULT_ATTEMPTS.toString(),
            validate: (input) => {
                if (input === '') return true;
                const num = parseInt(input);
                if (isNaN(num) || num <= 0) {
                    return '请输入有效的正整数';
                }
                return true;
            }
        },
        {
            type: 'input',
            name: 'interval',
            message: chalk.cyan('请输入间隔时间（秒）(回车使用默认值 1):'),
            default: '1',
            validate: (input) => {
                if (input === '') return true;
                const num = parseFloat(input);
                if (isNaN(num) || num <= 0) {
                    return '请输入有效的正数';
                }
                return true;
            }
        }
    ]);

    return {
        attempts: parseInt(answers.attempts) || DEFAULT_ATTEMPTS,
        interval: parseFloat(answers.interval) || 1
    };
}

async function play() {
    // 显示 ASCII 艺术字
    console.log(chalk.cyan('='.repeat(60)));
    console.log(chalk.cyan(figlet.textSync('Monad 抢跑机器人', { font: 'Standard' })));
    console.log(chalk.cyan('='.repeat(60)));

    // 显示作者信息
    console.log(chalk.yellow('\n👨‍💻 修改: caioudu'));
    console.log(chalk.yellow('💬 X: @caioudu'));
    console.log(chalk.cyan('\n' + '='.repeat(60)));

    console.log(chalk.green('\n🚀 正在初始化抢跑机器人...'));

    // 加载配置文件
    const configFile = toml.parse(fs.readFileSync('settings.toml', 'utf-8'));

    // 初始化 Provider 和钱包
    const provider = new ethers.JsonRpcProvider(configFile.api_settings.rpc_url);
    const wallet = new ethers.Wallet(configFile.eoa.private_key, provider);
    console.log(chalk.cyan(`\n👤 当前账户: ${wallet.address}`));

    // 检查网络连接
    try {
        await provider.getNetwork();
        console.log(chalk.green('\n✅ 成功连接到 Monad 网络!'));
    } catch (error) {
        console.log(chalk.red('\n❌ 连接以太坊网络失败'));
        throw error;
    }

    // 获取合约实例
    const contract = new ethers.Contract(
        configFile.game_settings.frontrunner_contract_address,
        JSON.parse(configFile.game_settings.abi_string),
        wallet
    );

    // 检查账户余额
    const balance = ethers.formatEther(await provider.getBalance(wallet.address));
    console.log(chalk.yellow(`\n💰 账户余额: ${balance} 测试网 Monad`));

    if (parseFloat(balance) < BALANCE_THRESHOLD) {
        console.log(chalk.red('\n❌ 账户余额不足，请充值后继续'));
        console.log(chalk.yellow('⚠️ 正在退出游戏...'));
        return;
    }

    // 获取 Gas 价格
    const feeData = await provider.getFeeData();
    const currentGasPrice = ethers.formatUnits(feeData.gasPrice || 0, 'gwei');
    console.log(chalk.yellow(`\n⛽ 当前 Gas 价格: ${currentGasPrice} GWEI`));

    while (true) {
        const mode = await showGameModeMenu();

        if (mode === 'exit') {
            console.log(chalk.yellow('\n👋 感谢使用！下次再见！'));
            return;
        }

        let attempts, interval;
        if (mode === 'automatic') {
            attempts = DEFAULT_ATTEMPTS;
            interval = 1;
        } else {
            const settings = await getManualSettings();
            attempts = settings.attempts;
            interval = settings.interval;
        }

        console.log(chalk.green(`\n🎯 开始游戏，尝试次数: ${attempts} 次，间隔时间: ${interval} 秒`));

        // 获取游戏成绩
        try {
            const [_, wins, losses] = await contract.getScore(wallet.address);
            if (wins > 0 || losses > 0) {
                console.log(chalk.cyan(`\n🏆 游戏统计: ${wins} 胜 | ${losses} 败`));
            } else {
                console.log(chalk.cyan('\n🎮 欢迎新玩家！祝您旗开得胜！'));
            }
        } catch (error) {
            console.log(chalk.red(`\n❌ 获取成绩失败: ${error} - 将继续运行...`));
        }

        const nonce = await provider.getTransactionCount(wallet.address);
        console.log(chalk.yellow(`\n📝 起始 Nonce 值: ${nonce}`));

        let attemptsRemaining = attempts;
        const spinner = ora('🎮 游戏进度').start();

        while (attemptsRemaining > 0) {
            try {
                const tx = await contract.frontrun({
                    gasLimit: GAS_LIMIT,
                    nonce: nonce + (attempts - attemptsRemaining)
                });
                await tx.wait();
                console.log(chalk.green(`\n✅ 交易发送成功！哈希: ${tx.hash}`));
            } catch (error) {
                console.log(chalk.red(`\n❌ 交易失败！错误信息: ${error.message}`));
            }

            await new Promise(resolve => setTimeout(resolve, interval * 1000));
            attemptsRemaining--;
            spinner.text = `🎮 进度: ${attempts - attemptsRemaining}/${attempts}`;
        }

        spinner.succeed(chalk.yellow('\n🏁 游戏结束！返回主菜单...'));
    }
}

play().catch(console.error);
