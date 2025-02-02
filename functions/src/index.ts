import * as functions from 'firebase-functions/v2';
const request = require('request');
const fs = require('fs');
const config = require('./config');
const mentions: Map<string, string> = config.mentionlist;
const statuslist: Map<string, string> = config.statuslist;
const prstatuslist: Map<string, string> = config.prstatuslist;

export const backlog = functions.https.onRequest((req, res) => {
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
    else{
        const localenvpath = __dirname + '/../env.prod.json';
        if (fs.existsSync(localenvpath)) {
            env = require(localenvpath);
            console.log('Loaded local env: ' + localenvpath);
        }
    }

    let slack_url = env.slack_url;
    let backlog_url = env.backlog_url;

    let channel: string = '';
    if (req.query.channel) {
        channel = req.query.channel.toString();
    }

    let body = req.body;
    let color = '#E3E4E6';
    let pretext = '';
    let text = '';

    // メンション
    try {
        if (body.content.comment != null && body.content.comment.content != null) {
            mentions.forEach((value: string, key: any) => {
                body.content.comment.content = body.content.comment.content.replace(new RegExp(key, "g"), value);
            });
        }
    } catch (e) {
        console.log(e);
    }

    // メッセージ
    try {
        let label = "";
        let url = "";
        switch (body.type) {
            case 1:
                label = '課題の追加';
                // color
                if (body.content.issueType != null && body.content.issueType.color != null) {
                    color = body.content.issueType.color;
                }
                // 投稿メッセージを整形
                url = `${backlog_url}/view/${body.project.projectKey}-${body.content.key_id}`;

                pretext = `*Backlog ${label}* _by ${body.createdUser.name}_\n`;
                pretext += `<${url}|[${body.project.projectKey}-${body.content.key_id}] - ${body.content.summary} > `;
                if (body.content.description != null) {
                    text = `${body.content.description}\n`;
                }
                break;
            case 2:
                label = '課題の更新'
                // color
                if (body.content.issueType != null && body.content.issueType.color != null) {
                    color = body.content.issueType.color;
                }

                // 投稿メッセージを整形
                url = `${backlog_url}/view/${body.project.projectKey}-${body.content.key_id}`;
                if (body.content.comment != null && body.content.comment.id != null) {
                    url += `#comment-${body.content.comment.id}`;
                }

                pretext = `*Backlog ${label}* _by ${body.createdUser.name}_\n`;
                pretext += `<${url}|[${body.project.projectKey}-${body.content.key_id}] - ${body.content.summary} > `;

                if (body.content.comment != null && body.content.comment?.content != null) {
                    text += `${body.content.comment.content}\n`;
                }

                if (body.content.diff != null) {
                    text += `\n${body.content.diff}\n`
                }
                for (let change of body.content.changes) {
                    if (change.field == 'status') {
                        const old_value: string = statuslist.get(change.old_value.toString()) ? statuslist.get(change.old_value.toString()) : change.old_value.toString();
                        const new_value: string = statuslist.get(change.new_value.toString()) ? statuslist.get(change.new_value.toString()) : change.new_value.toString();

                        text += `\`ステータス：${old_value} -> ${new_value}\`\n`;
                    }
                    if (change.field == 'assigner') {
                        text += `\`担当者：${change.old_value} -> ${change.new_value}\`\n`;
                    }
                }
                break;
            case 3:
                label = '課題にコメント';
                // color
                if (body.content.issueType != null && body.content.issueType.color != null) {
                    color = body.content.issueType.color;
                }
                // 投稿メッセージを整形
                url = `${backlog_url}/view/${body.project.projectKey}-${body.content.key_id}`;
                if (body.content.comment != null && body.content.comment.id != null) {
                    url += `#comment-${body.content.comment.id}`;
                }

                pretext = `*Backlog ${label}* _by ${body.createdUser.name}_\n`;
                pretext += `<${url}|[${body.project.projectKey}-${body.content.key_id}] - ${body.content.summary} > `;
                if (body.content.comment != null && body.content.comment?.content != null) {
                    text = `${body.content.comment.content}\n`;
                }
                break;
            case 4:
                label = '課題の削除';
                // color
                if (body.content.issueType != null && body.content.issueType.color != null) {
                    color = body.content.issueType.color;
                }
                // 投稿メッセージを整形
                url = `${backlog_url}/view/${body.project.projectKey}-${body.content.key_id}`;
                if (body.content.comment != null && body.content.comment.id != null) {
                    url += `#comment-${body.content.comment.id}`;
                }

                pretext = `*Backlog ${label}* _by ${body.createdUser.name}_\n`;
                pretext += `<${url}|[${body.project.projectKey}-${body.content.key_id}] - ${body.content.summary} > `;
                if (body.content.comment != null && body.content.comment?.content != null) {
                    text = `${body.content.comment.content}\n`;
                }
                break;
            case 5:
                label = 'Wikiを追加';
                // 投稿メッセージを整形
                url = `${backlog_url}/wiki/${body.project.projectKey}/${body.content.name}`;

                pretext = `*Backlog ${label}* _by ${body.createdUser.name}_\n`;
                pretext += `<${url}|[[${body.project.projectKey}-Wiki-${body.content.name}]>`;
                if (body.content.content != null) {
                    text += `${body.content.content}\n`;
                }
                break;
            case 6:
                label = 'Wikiを更新'
                // 投稿メッセージを整形
                url = `${backlog_url}/wiki/${body.project.projectKey}/${body.content.name}`

                pretext = `*Backlog ${label}* _by ${body.createdUser.name}_\n`;
                pretext += `<${url}|[[${body.project.projectKey}-Wiki-${body.content.name}]>`;
                if (body.content.diff != null) {
                    text += `${body.content.diff}\n`
                }
                break;
            case 7:
                label = 'Wikiを削除'
                // 投稿メッセージを整形
                url = `${backlog_url}/wiki/${body.project.projectKey}/${body.content.name}`;

                pretext = `*Backlog ${label}* _by ${body.createdUser.name}_\n`;
                pretext += `<${url}|[[${body.project.projectKey}-Wiki-${body.content.name}]>`;
                break;
            case 8:
                label = '共有ファイルを追加'
                // 投稿メッセージを整形
                url = `${backlog_url}/file/${body.project.projectKey}/${body.content.dir}${body.content.name}`

                pretext = `*Backlog ${label}* _by ${body.createdUser.name}_\n`;
                pretext += `<${url}|[${body.project.projectKey}/${body.content.dir}${body.content.name}>`;
                break;
            case 9:
                label = '共有ファイルを更新'
                // 投稿メッセージを整形
                url = `${backlog_url}/file/${body.project.projectKey}/${body.content.dir}${body.content.name}`

                pretext = `*Backlog ${label}* _by ${body.createdUser.name}_\n`;
                pretext += `<${url}|[${body.project.projectKey}/${body.content.dir}${body.content.name}>`;
                break;
            case 10:
                label = '共有ファイルを削除'
                // 投稿メッセージを整形
                url = `${backlog_url}/file/${body.project.projectKey}/${body.content.dir}${body.content.name}`

                pretext = `*Backlog ${label}* _by ${body.createdUser.name}_\n`;
                pretext += `<${url}|[${body.project.projectKey}/${body.content.dir}${body.content.name}>`;
                break;
            case 11:
                label = 'Subversionコミット'
                pretext = `*Backlog ${label}* _by ${body.createdUser.name}_\n`;
                break;
            case 12:
                label = 'GITプッシュ'
                color = '#4D7FC6'
                // 投稿メッセージを整形
                url = `${backlog_url}/git/${body.project.projectKey}/${body.content.repository.name}/commit`;

                pretext = `*Backlog ${label}* ${body.content.change_type} _by ${body.createdUser.name}_\n`;
                pretext += `[${body.project.projectKey}-${body.content.repository.name}] - ${body.content.ref}\n`;
                for (let rev of body.content.revisions) {
                    text += `\`<${url}/${rev.rev}|${rev.rev.substr(0, 7)}>\` ${rev.comment}\n`;
                }
                break;
            case 13:
                label = 'GITリポジトリ作成'
                // 投稿メッセージを整形
                url = `${backlog_url}/view/${body.project.projectKey}-${body.content.key_id}`;
                if (body.content.comment != null && body.content.comment.id != null) {
                    url += `#comment-${body.content.comment.id}`;
                }

                pretext = `*Backlog ${label}*\n`;
                pretext += `[${body.project.projectKey}-${body.content.key_id}] - `;
                pretext += `${body.content.summary} _by ${body.createdUser.name}_`;
                if (body.content.comment != null && body.content.comment?.content != null) {
                    text = `${body.content.comment.content}\n`;
                }
                text += `${url}`;
                break;
            case 14:
                label = '課題をまとめて更新'
                // 投稿メッセージを整形
                pretext = `*Backlog ${label}* _by ${body.createdUser.name}_\n`;
                if (body.content.comment != null && body.content.comment?.content != null) {
                    text = `${body.content.comment.content}\n`;
                }

                for (let change of body.content.changes) {
                    if (change.field == 'status') {
                        const new_value: string = statuslist.get(change.new_value.toString()) ? statuslist.get(change.new_value.toString()) : change.new_value.toString();
                        text += `\`ステータス： -> ${new_value}\`\n`;
                    }
                    if (change.field == 'assigner') {
                        text += `\`担当者： -> ${change.new_value}\`\n`;
                    }
                    if (change.field == 'milestone') {
                        text += `\`マイルストーン： -> ${change.new_value}\`\n`;
                    }
                }
                text +='\n';

                for (let link of body.content.link) {
                    var linkurl = `${backlog_url}/view/${body.project.projectKey}-${link.key_id}`;
                    // text += `<${linkurl}|[${body.project.projectKey}-${link.key_id}]${link.title}>` + '\n';
                    text += `<${linkurl}|[${body.project.projectKey}-${link.key_id}]> ` + link.title +'\n';
                }

                break;
            case 15:
                label = 'プロジェクトに参加'
                // 投稿メッセージを整形
                url = `${backlog_url}/view/${body.project.projectKey}-${body.content.key_id}`;
                if (body.content.comment != null && body.content.comment.id != null) {
                    url += `#comment-${body.content.comment.id}`;
                }

                pretext = `*Backlog ${label}*\n`;
                pretext += `[${body.project.projectKey}-${body.content.key_id}] - `;
                pretext += `${body.content.summary} _by ${body.createdUser.name}_`;
                if (body.content.comment != null && body.content.comment?.content != null) {
                    text = `${body.content.comment.content}\n`;
                }
                text += `${url}`;
                break;
            case 16:
                label = 'プロジェクトから脱退'
                // 投稿メッセージを整形
                url = `${backlog_url}/view/${body.project.projectKey}-${body.content.key_id}`;
                if (body.content.comment != null && body.content.comment.id != null) {
                    url += `#comment-${body.content.comment.id}`;
                }

                pretext = `*Backlog ${label}*\n`;
                pretext += `[${body.project.projectKey}-${body.content.key_id}] - `;
                pretext += `${body.content.summary} _by ${body.createdUser.name}_`;
                if (body.content.comment != null && body.content.comment?.content != null) {
                    text = `${body.content.comment.content}\n`;
                }
                text += `${url}`;
                break;
            case 17:
                label = 'コメントにお知らせを追加'
                // 投稿メッセージを整形
                url = `${backlog_url}/view/${body.project.projectKey}-${body.content.key_id}`;
                if (body.content.comment != null && body.content.comment.id != null) {
                    url += `#comment-${body.content.comment.id}`;
                }

                pretext = `*Backlog ${label}*\n`;
                pretext += `[${body.project.projectKey}-${body.content.key_id}] - `;
                pretext += `${body.content.summary} _by ${body.createdUser.name}_`;
                if (body.content.comment != null && body.content.comment?.content != null) {
                    text = `${body.content.comment.content}\n`;
                }
                text += `${url}`;
                break;
            case 18:
                label = 'プルリクエストの追加'
                // 投稿メッセージを整形
                url = `${backlog_url}/git/${body.project.projectKey}/${body.content.repository.name}/pullRequests/${body.content.number}`;

                pretext = `*Backlog ${label}* _by ${body.createdUser.name}_\n`;
                pretext += `<${url}|[${body.project.projectKey}-${body.content.repository.name}] - ${body.content.summary}>`;
                text += `${body.content.description}\n`;
                break;
            case 19:
                label = 'プルリクエストの更新'
                // 投稿メッセージを整形
                url = `${backlog_url}/git/${body.project.projectKey}/${body.content.repository.name}/pullRequests/${body.content.number}#comment-${body.content.comment.id}`;

                pretext = `*Backlog ${label}* _by ${body.createdUser.name}_\n`;
                pretext += `<${url}|[${body.project.projectKey}-${body.content.repository.name}] - ${body.content.summary}>`;
                if (body.content.comment != null && body.content.comment?.content != null) {
                    text = `${body.content.comment.content}\n`;
                }
                if (body.content.diff != null) {
                    text += `\n${body.content.diff}\n`
                }
                for (let change of body.content.changes) {
                    if (change.field == 'status') {
                        const old_value: string = prstatuslist.get(change.old_value.toString()) ? prstatuslist.get(change.old_value.toString()) : change.old_value.toString();
                        const new_value: string = prstatuslist.get(change.new_value.toString()) ? prstatuslist.get(change.new_value.toString()) : change.new_value.toString();

                        text += `\`ステータス：${old_value} -> ${new_value}\`\n`;
                    }
                    if (change.field == 'assignee') {
                        text += `\`担当者：${change.old_value} -> ${change.new_value}\`\n`;
                    }
                }
                break;
            case 20:
                label = 'プルリクエストにコメント'
                color = '#C3EBB2'
                // 投稿メッセージを整形
                url = `${backlog_url}/git/${body.project.projectKey}/${body.content.repository.name}/pullRequests/${body.content.number}#comment-${body.content.comment.id}`;

                pretext = `*Backlog ${label}* _by ${body.createdUser.name}_\n`;
                pretext += `<${url}|[${body.project.projectKey}-${body.content.repository.name}] - ${body.content.summary}>`;
                if (body.content.comment != null && body.content.comment?.content != null) {
                    text = `${body.content.comment.content}\n`;
                }
                break;
            case 21:
                label = 'プルリクエストにコメント'
                color = '#C3EBB2'
                // 投稿メッセージを整形
                url = `${backlog_url}/git/${body.project.projectKey}/${body.content.repository.name}/pullRequests/${body.content.number}#comment-${body.content.comment.id}`;

                pretext = `*Backlog ${label}* _by ${body.createdUser.name}_\n`;
                pretext += `<${url}|[${body.project.projectKey}-${body.content.repository.name}] - ${body.content.summary}>`;
                if (body.content.comment != null && body.content.comment?.content != null) {
                    text = `${body.content.comment.content}\n`;
                }
                break;
            case 22:
                label = 'マイルストーンの追加'
                // 投稿メッセージを整形
                pretext = `*Backlog ${label}* _by ${body.createdUser.name}_\n`;
                pretext += `[${body.project.projectKey}]`;
                if (body.content != null && body.content.name != null) {
                    text = `${body.content.name}\n`;
                }
                break;
            case 23:
                // TODO undefinedが出るはず　未対応
                label = 'マイルストーンの更新'
                // 投稿メッセージを整形
                url = `${backlog_url}/view/${body.project.projectKey}-${body.content.key_id}`;
                if (body.content.comment != null && body.content.comment.id != null) {
                    url += `#comment-${body.content.comment.id}`;
                }

                pretext = `*Backlog ${label}* _by ${body.createdUser.name}_\n`;
                pretext += `[${body.project.projectKey}-${body.content.key_id}] - `;
                pretext += `${body.content.summary} _by ${body.createdUser.name}_`;
                if (body.content.comment != null && body.content.comment?.content != null) {
                    text = `${body.content.comment.content}\n`;
                }
                text += `${url}`;
                break;
            case 24:
                // TODO undefinedが出るはず　未対応
                label = 'マイルストーンの削除';
                // 投稿メッセージを整形
                url = `${backlog_url}/view/${body.project.projectKey}-${body.content.key_id}`;
                if (body.content.comment != null && body.content.comment.id != null) {
                    url += `#comment-${body.content.comment.id}`;
                }

                pretext = `*Backlog ${label}*\n`;
                pretext += `[${body.project.projectKey}-${body.content.key_id}] - `;
                pretext += `${body.content.summary} _by ${body.createdUser.name}_`;
                if (body.content.comment != null && body.content.comment?.content != null) {
                    text = `${body.content.comment.content}\n`;
                }
                text += `${url}`;
                break;
            default:
                // 課題関連以外はスルー
                label = '対応していないタイプです';
                pretext = `*Backlog ${label}* ${body.type} _by ${body.createdUser.name}_\n`;
                break;
        }

    } catch (e) {
        console.log(e);
    }

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

    let options = {
        uri: slack_url,
        headers: {
            "Content-type": "application/json",
        },
        json: true,
        body: data
    };
    
    request.post(options, function (err: any) {
        if (err != null) {
            console.log(err);
        }
    });

    res.send("OK");
});
