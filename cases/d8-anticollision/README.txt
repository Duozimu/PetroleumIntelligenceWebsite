Petro × AI Atlas · D8 邻井防碰与轨迹安全优化
版本：1.0.0 · 2026-11-03

【五文件清单】
d8-anticollision/
  case.json
  README.txt
  demo/
    index.html
    demo.css
    demo.js

【如何导入】
1. 解压本 ZIP，保留 d8-anticollision 文件夹及以上相对路径。
2. 在教学平台的 drilling 环节注册场景 ID：d8-anticollision（如果尚未注册）。
3. 主站技术分类需存在 ml 和 opt 两个代码；所提供的历史版本 data.js 可能没有 ml，需要先在平台技术字典中添加“ml / 机器学习”。
4. 在平台案例导入处拖入整个 d8-anticollision 文件夹，确认校验结果。
5. 如果平台支持直接解析 ZIP，也可导入 ZIP；旧版上传器可能只支持解压后的文件夹。
6. 页面可直接双击 demo/index.html 独立预览；完全离线，零 CDN、零第三方运行库。

【三个板块】
01 专业背景：丛式井测斜误差、磁干扰、EOU、ISCWSA、SF* 与蒙特卡洛概率的工程解释和引用。
02 案例流程：MWD 质控 → 误差校正与 EOU → MC + 预测控制 → 定向工程师授权 → 实钻反馈。包含数学约束和 Python 风格伪代码。
03 交互演示：俯视轨迹 SVG、3D 近距数值、误差椭圆、前方 50 m 风险曲线、人工方位角设置、AI 推荐、人工拒绝与审计日志。

【试操作】
• 打开“03 交互演示”，观察当前井随时间向邻井靠近；左侧是俯视投影，但最近距离是 3D 计算。
• 拖动方位角：仅预览，不会自动改变已执行井眼。
• 点“采纳 AI 避让轨迹”：工程师明确授权后，模拟钻头按受限转向速率逐步偏移。
• 点“拒绝 AI · 保持方位”：可以看到风险上升；这是受限沙箱中的风险教学，绝非真实作业建议。
• 点“人工指令”：记录执行方位和当次模拟风险。
• “暂停推进 / 单步前进 / 重置案例”适合课堂讲解与截图。
• 当教学几何模型中的三维距离达到合并井眼半径时，程序终止演示，并保留风险审计。

【模型定义（必须对导师说明）】
- 此网页不含真实训练好的 RandomForest / XGBoost；误差函数是合成的、可解释的高斯相对误差代理。学术背景介绍可行的真实模型框架。
- 使用二维俯视图表达轨迹；实际接触判定使用三维 E、N、TVD 与邻井线段间最近距离。
- SF* 为教学方向投影简化指标：d_center / (r1+r2+k*sqrt(n^T Sigma_rel n))；不是所有公司统一采用的标准 separation factor。
- MC 在未来 50 m 的合成井段上，使用沿路径相干的三维相对位置偏移抽样，统计至少一处接触井筒的比例；其结果仅适用于模型假设，不是经过现场验证的碰撞概率。
- AI 避让用有限候选方位角和动态约束来模拟滚动预测控制思想，不使用真正的工业 MPC 求解器；在模型安全可行域内，也不能声称真实钻进“绝对不相撞”。
- 网页里的 3% Pc、SF* 1.1、2σ 与井眼半径等为教学数值，不得用于任何实际施工审批。
- 真实工程需要 ISCWSA 适用的测斜误差模型、工具/磁场 QC、准确邻井档案、井径及套管、钻具造斜能力、项目具体防碰管理制度、授权人员复核。

【公开资料】
ISCWSA 2013 Collision Avoidance Calculations - Current Common Practice
https://www.iscwsa.net/articles/collision-avoidance-calculations-current-common-practice/
ISCWSA Error Model Documentation Revision 5
https://www.iscwsa.net/error-model-documentation/
SPE-184730-MS Well Collision Avoidance Management and Principles
https://www.iscwsa.net/media/files/files/584292ba/02-stevesawaryn-collisionavoidancemgmtprinciples-spe184730-march-17.pdf
Mansouri et al. (2020) Optimizing the separation factor along a directional well trajectory to minimize collision risk
https://link.springer.com/article/10.1007/s13202-020-00876-7

【浏览器】
使用支持原生 SVG 的现代 Chrome / Edge / Firefox 浏览器。无需网络或外部字体文件。
若教学平台使用 sandbox iframe，至少应允许脚本运行（allow-scripts）。
