import { onRequest } from 'firebase-functions/v2/https';
import axios from 'axios';
const fs = require('fs');
const config = require('./config');
const mentions: Map<string, string> = config.mentionlist;
const statuslist: Map<string, string> = config.statuslist;
const prstatuslist: Map<string, string> = config.prstatuslist;

// changes[].field -> 日本語ラベル
const fieldLabels: { [key: string]: string } = {
    status: 'ステータス',
    assigner: '担当者',
    assignee: '担当者',
    name: '名称',
    priority: '優先度',
    milestone: 'マイルストーン',
    version: '発生バージョン',
    category: 'カテゴリー',
    resolution: '完了理由',
    limitDate: '期限',
    startDate: '開始日',
    start_date: '開始日',
    reference_date: '基準日',
    summary: '件名',
    description: '説明',
    estimatedHours: '予定時間',
    actualHours: '実績時間',
    component: 'コンポーネント',
    attachment: '添付ファイル',
    notify: '通知',
};

// 本文中の @メンション等を Slack の記法へ変換する（コメント・説明など経路を問わず適用）
function applyMentions(text: string): string {
    if (!text) {
        return text;
    }
    mentions.forEach((value: string, key: any) => {
        text = text.replace(new RegExp(key, 'g'), value);
    });
    return text;
}

// changes[] を `ラベル：before -> after` のインラインコード行へ整形する
// status 系は id を名称マップで変換する。old_value が無い場合は after のみ表示。
function formatChanges(changes: any, statusMap: Map<string, string>): string {
    let out = '';
    if (!Array.isArray(changes)) {
        return out;
    }
    for (const change of changes) {
        if (change == null || change.field == null) {
            continue;
        }
        const label = fieldLabels[change.field] ? fieldLabels[change.field] : change.field;
        const conv = (v: any): string => {
            if (v == null || v === '') {
                return '';
            }
            const s = v.toString();
            if (change.field === 'status') {
                const mapped = statusMap.get(s);
                return mapped != null ? mapped : s;
            }
            return s;
        };
        const before = conv(change.old_value);
        const after = conv(change.new_value);
        if (before !== '') {
            out += `\`${label}：${before} -> ${after}\`\n`;
        } else {
            out += `\`${label}：${after}\`\n`;
        }
    }
    return out;
}

// 課題のメタ情報（種別/優先度/担当者/期限）を1行にまとめる（存在するもののみ）。
// full=false の場合は担当者のみ。
function issueMeta(content: any, full: boolean): string {
    const parts: string[] = [];
    if (full && content.issueType != null && content.issueType.name != null) {
        parts.push(`種別: ${content.issueType.name}`);
    }
    if (full && content.priority != null && content.priority.name != null) {
        parts.push(`優先度: ${content.priority.name}`);
    }
    if (content.assignee != null && content.assignee.name != null) {
        parts.push(`担当: ${content.assignee.name}`);
    }
    if (full && content.dueDate != null) {
        parts.push(`期限: ${content.dueDate}`);
    }
    // 付加情報はインラインコードにして人のコメントと視覚的に分ける
    return parts.length > 0 ? '`' + parts.join(' / ') + '`\n' : '';
}

// 共有ファイルの URL を組み立て、パスの // を正規化する
function fileUrl(backlog_url: string, projectKey: string, content: any): string {
    const path = `${content.dir != null ? content.dir : ''}${content.name}`;
    return `${backlog_url}/file/${projectKey}/${path}`.replace(/([^:])\/{2,}/g, '$1/');
}

export const backlog = onRequest((req, res) => {
    if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
    }
    if (!req.body) {
        res.status(400).send('Request Body Not Found');
        return;
    }

    let env = process.env;

    if (process.env.NODE_ENV !== 'production') {
        const localenvpath = __dirname + '/../env.dev.json';
        if (fs.existsSync(localenvpath)) {
            env = require(localenvpath);
            console.log('Loaded local env: ' + localenvpath);
        }
    }
    else {
        const localenvpath = __dirname + '/../env.prod.json';
        if (fs.existsSync(localenvpath)) {
            env = require(localenvpath);
            console.log('Loaded local env: ' + localenvpath);
        }
    }

    let slack_url = env.slack_url;
    let backlog_url: any = env.backlog_url;

    let channel: string = '';
    if (req.query.channel) {
        channel = req.query.channel.toString();
    }

    let body = req.body;
    let content = body.content;
    let projectKey = body.project != null ? body.project.projectKey : '';
    let userName = body.createdUser != null ? body.createdUser.name : '';
    let color = '#E3E4E6';
    let pretext = '';
    let text = '';

    // メッセージ
    try {
        let label = '';
        let url = '';
        switch (body.type) {
            case 1:
                label = '課題の追加';
                if (content.issueType != null && content.issueType.color != null) {
                    color = content.issueType.color;
                }
                url = `${backlog_url}/view/${projectKey}-${content.key_id}`;
                pretext = `*Backlog ${label}* _by ${userName}_\n`;
                pretext += `<${url}|[${projectKey}-${content.key_id}] - ${content.summary} > `;
                // 人の説明文（プレーン）を先に、付加情報（インラインコード）を後に
                if (content.description != null) {
                    text += `${content.description}\n`;
                }
                text += issueMeta(content, true);
                break;
            case 2:
                label = '課題の更新';
                if (content.issueType != null && content.issueType.color != null) {
                    color = content.issueType.color;
                }
                url = `${backlog_url}/view/${projectKey}-${content.key_id}`;
                if (content.comment != null && content.comment.id != null) {
                    url += `#comment-${content.comment.id}`;
                }
                pretext = `*Backlog ${label}* _by ${userName}_\n`;
                pretext += `<${url}|[${projectKey}-${content.key_id}] - ${content.summary} > `;
                // 更新は「人のコメント（プレーン）」＋「変更があったものだけ」（インラインコード）
                if (content.comment != null && content.comment.content != null) {
                    text += `${content.comment.content}\n`;
                }
                if (content.diff != null) {
                    text += `\n${content.diff}\n`;
                }
                text += formatChanges(content.changes, statuslist);
                break;
            case 3:
                label = '課題にコメント';
                if (content.issueType != null && content.issueType.color != null) {
                    color = content.issueType.color;
                }
                url = `${backlog_url}/view/${projectKey}-${content.key_id}`;
                if (content.comment != null && content.comment.id != null) {
                    url += `#comment-${content.comment.id}`;
                }
                pretext = `*Backlog ${label}* _by ${userName}_\n`;
                pretext += `<${url}|[${projectKey}-${content.key_id}] - ${content.summary} > `;
                if (content.comment != null && content.comment.content != null) {
                    text = `${content.comment.content}\n`;
                }
                break;
            case 4:
                // 削除の content は {id, key_id} のみ（summary 無し）
                label = '課題の削除';
                url = `${backlog_url}/view/${projectKey}-${content.key_id}`;
                pretext = `*Backlog ${label}* _by ${userName}_\n`;
                pretext += `<${url}|[${projectKey}-${content.key_id}]>`;
                break;
            case 5:
                label = 'Wikiを追加';
                url = `${backlog_url}/wiki/${projectKey}/${content.name}`;
                pretext = `*Backlog ${label}* _by ${userName}_\n`;
                pretext += `<${url}|[[${projectKey}-Wiki-${content.name}]>`;
                if (content.content != null) {
                    text += `${content.content}\n`;
                }
                break;
            case 6:
                label = 'Wikiを更新';
                url = `${backlog_url}/wiki/${projectKey}/${content.name}`;
                pretext = `*Backlog ${label}* _by ${userName}_\n`;
                pretext += `<${url}|[[${projectKey}-Wiki-${content.name}]>`;
                if (content.diff != null) {
                    text += `${content.diff}\n`;
                }
                if (content.version != null) {
                    text += `\`版数: ${content.version}\`\n`;
                }
                break;
            case 7:
                label = 'Wikiを削除';
                url = `${backlog_url}/wiki/${projectKey}/${content.name}`;
                pretext = `*Backlog ${label}* _by ${userName}_\n`;
                pretext += `<${url}|[[${projectKey}-Wiki-${content.name}]>`;
                break;
            case 8:
            case 9:
            case 10: {
                const fileLabels: { [key: number]: string } = { 8: '共有ファイルを追加', 9: '共有ファイルを更新', 10: '共有ファイルを削除' };
                label = fileLabels[body.type];
                url = fileUrl(backlog_url, projectKey, content);
                const dispPath = `${content.dir != null ? content.dir : ''}${content.name}`.replace(/^\//, '');
                pretext = `*Backlog ${label}* _by ${userName}_\n`;
                pretext += `<${url}|[${projectKey}/${dispPath}]>`;
                if (content.size != null) {
                    text += `\`サイズ: ${content.size} bytes\`\n`;
                }
                break;
            }
            case 11:
                // content は {rev, comment}
                label = 'Subversionコミット';
                pretext = `*Backlog ${label}* _by ${userName}_\n`;
                if (content != null && content.rev != null) {
                    text += `\`r${content.rev}\` ${content.comment != null ? content.comment : ''}\n`;
                }
                break;
            case 12:
                label = 'GITプッシュ';
                color = '#4D7FC6';
                url = `${backlog_url}/git/${projectKey}/${content.repository.name}/commit`;
                pretext = `*Backlog ${label}* ${content.change_type} _by ${userName}_\n`;
                pretext += `[${projectKey}-${content.repository.name}] - ${content.ref}`;
                if (content.revision_count != null) {
                    pretext += ` (${content.revision_count} commit)`;
                }
                pretext += `\n`;
                if (Array.isArray(content.revisions)) {
                    for (const rev of content.revisions) {
                        text += `\`<${url}/${rev.rev}|${rev.rev.substr(0, 7)}>\` ${rev.comment}\n`;
                    }
                }
                break;
            case 13: {
                // content は {repository{id,name,description}} のみ
                label = 'GITリポジトリ作成';
                color = '#4D7FC6';
                const repo = content.repository;
                url = `${backlog_url}/git/${projectKey}/${repo.name}`;
                pretext = `*Backlog ${label}* _by ${userName}_\n`;
                pretext += `<${url}|[${projectKey}] ${repo.name}>`;
                if (repo.description != null) {
                    text += `${repo.description}\n`;
                }
                break;
            }
            case 14:
                label = '課題をまとめて更新';
                pretext = `*Backlog ${label}* _by ${userName}_\n`;
                if (content.comment != null && content.comment.content != null && content.comment.content !== '') {
                    text += `${content.comment.content}\n`;
                }
                text += formatChanges(content.changes, statuslist);
                if (Array.isArray(content.link)) {
                    text += '\n';
                    for (const link of content.link) {
                        const linkurl = `${backlog_url}/view/${projectKey}-${link.key_id}`;
                        text += `<${linkurl}|[${projectKey}-${link.key_id}]> ${link.title}\n`;
                    }
                }
                break;
            case 15:
            case 16: {
                // content は {users[{id,name}], group_project_activities[], comment}
                label = body.type === 15 ? 'プロジェクトに参加' : 'プロジェクトから脱退';
                pretext = `*Backlog ${label}* _by ${userName}_\n`;
                if (Array.isArray(content.users)) {
                    text += content.users.map((u: any) => u.name).join('\n') + '\n';
                }
                if (content.comment != null && content.comment !== '') {
                    text += `${content.comment}\n`;
                }
                break;
            }
            case 17:
                label = 'コメントにお知らせを追加';
                if (content.issueType != null && content.issueType.color != null) {
                    color = content.issueType.color;
                }
                url = `${backlog_url}/view/${projectKey}-${content.key_id}`;
                if (content.comment != null && content.comment.id != null) {
                    url += `#comment-${content.comment.id}`;
                }
                pretext = `*Backlog ${label}* _by ${userName}_\n`;
                pretext += `<${url}|[${projectKey}-${content.key_id}] - ${content.summary} > `;
                if (content.comment != null && content.comment.content != null) {
                    text = `${content.comment.content}\n`;
                }
                break;
            case 18:
                label = 'プルリクエストの追加';
                url = `${backlog_url}/git/${projectKey}/${content.repository.name}/pullRequests/${content.number}`;
                pretext = `*Backlog ${label}* _by ${userName}_\n`;
                pretext += `<${url}|[${projectKey}-${content.repository.name}] - ${content.summary}>`;
                // 人の説明文（プレーン）を先に、付加情報（インラインコード）を後に
                if (content.description != null) {
                    text += `${content.description}\n`;
                }
                // マージ方向は Backlog 表示に合わせて base ← branch（左向き）
                if (content.base != null && content.branch != null) {
                    text += `\`${content.base} ← ${content.branch}\`\n`;
                }
                if (content.assignee != null && content.assignee.name != null) {
                    text += `\`担当: ${content.assignee.name}\`\n`;
                }
                if (content.issue != null && content.issue.key_id != null) {
                    const issueurl = `${backlog_url}/view/${projectKey}-${content.issue.key_id}`;
                    text += `関連課題: <${issueurl}|[${projectKey}-${content.issue.key_id}]>\n`;
                }
                break;
            case 19:
                label = 'プルリクエストの更新';
                url = `${backlog_url}/git/${projectKey}/${content.repository.name}/pullRequests/${content.number}`;
                if (content.comment != null && content.comment.id != null) {
                    url += `#comment-${content.comment.id}`;
                }
                pretext = `*Backlog ${label}* _by ${userName}_\n`;
                pretext += `<${url}|[${projectKey}-${content.repository.name}] - ${content.summary}>`;
                // 更新は「人のコメント（プレーン）」＋「変更があったものだけ」（インラインコード）
                if (content.comment != null && content.comment.content != null) {
                    text += `${content.comment.content}\n`;
                }
                if (content.diff != null) {
                    text += `\n${content.diff}\n`;
                }
                text += formatChanges(content.changes, prstatuslist);
                break;
            case 20:
                label = 'プルリクエストにコメント';
                color = '#C3EBB2';
                url = `${backlog_url}/git/${projectKey}/${content.repository.name}/pullRequests/${content.number}`;
                if (content.comment != null && content.comment.id != null) {
                    url += `#comment-${content.comment.id}`;
                }
                pretext = `*Backlog ${label}* _by ${userName}_\n`;
                pretext += `<${url}|[${projectKey}-${content.repository.name}] - ${content.summary}>`;
                if (content.comment != null && content.comment.content != null) {
                    text = `${content.comment.content}\n`;
                }
                break;
            case 22:
                // content は {id, name, start_date, reference_date, description}
                label = 'マイルストーンの追加';
                pretext = `*Backlog ${label}* _by ${userName}_\n`;
                pretext += `[${projectKey}] ${content.name}`;
                if (content.description != null && content.description !== '') {
                    text += `${content.description}\n`;
                }
                if (content.start_date != null || content.reference_date != null) {
                    text += `\`期間: ${content.start_date != null ? content.start_date : ''} 〜 ${content.reference_date != null ? content.reference_date : ''}\`\n`;
                }
                break;
            case 23:
                // content は {id, name, changes[]}
                label = 'マイルストーンの更新';
                pretext = `*Backlog ${label}* _by ${userName}_\n`;
                pretext += `[${projectKey}] ${content.name}`;
                text += formatChanges(content.changes, statuslist);
                break;
            case 24:
                label = 'マイルストーンの削除';
                pretext = `*Backlog ${label}* _by ${userName}_\n`;
                pretext += `[${projectKey}] ${content.name}`;
                if (content.start_date != null || content.reference_date != null) {
                    text += `\`期間: ${content.start_date != null ? content.start_date : ''} 〜 ${content.reference_date != null ? content.reference_date : ''}\`\n`;
                }
                break;
            case 36:
            case 37:
            case 49: {
                // content は {id(文字列hex), title}
                const docLabels: { [key: number]: string } = { 36: 'ドキュメントの追加', 37: 'ドキュメントの削除', 49: 'ドキュメントのメンション追加' };
                label = docLabels[body.type];
                pretext = `*Backlog ${label}* _by ${userName}_\n`;
                if (body.type === 37) {
                    // 削除済みはリンクしない
                    pretext += `[${projectKey}] ${content.title}`;
                } else {
                    url = `${backlog_url}/document/${projectKey}/${content.id}`;
                    pretext += `<${url}|[${projectKey}] ${content.title}>`;
                }
                break;
            }
            default:
                // 未対応タイプは Slack へは流さずログのみ
                console.log(`Unsupported backlog webhook type: ${body.type}`);
                res.send('OK');
                return;
        }

    } catch (e) {
        console.log(e);
    }

    // 本文中のメンションを Slack 記法へ変換（コメント・説明など経路を問わず）
    text = applyMentions(text);

    const data = {
        "channel": channel, //未指定でslack側の設定に従う
        "attachments": [
            {
                "pretext": pretext,
                "color": color,
                "text": text,
                "mrkdwn_in": ["text", "pretext"]
            }
        ]
    };

    if (slack_url) {
        axios.post(slack_url, data, {
            headers: {
                "Content-Type": "application/json",
            },
        }).catch((err) => {
            console.log(err);
        });
    } else {
        console.log("slack_url is not configured");
    }

    res.send("OK");
});
