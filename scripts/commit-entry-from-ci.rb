require "base64"
require "json"
require "net/http"
require "uri"

def required_env(name)
  value = ENV[name].to_s
  abort("#{name} is required") if value.empty?
  value
end

api_v4_url = required_env("CI_API_V4_URL")
project_id = required_env("CI_PROJECT_ID")
write_token = required_env("GITLAB_WRITE_TOKEN")
target_branch = ENV["TARGET_BRANCH"].to_s.empty? ? ENV["CI_COMMIT_REF_NAME"].to_s : ENV["TARGET_BRANCH"].to_s
entries_path = ENV["ENTRIES_PATH"].to_s.empty? ? "entries" : ENV["ENTRIES_PATH"].to_s.gsub(%r{\A\./}, "").gsub(%r{/+\z}, "")
requested_filename = required_env("ENTRY_FILENAME")
markdown = Base64.decode64(required_env("ENTRY_MARKDOWN_BASE64"))
images_json = ENV["ENTRY_IMAGES_JSON_BASE64"].to_s.empty? ? "[]" : Base64.decode64(ENV["ENTRY_IMAGES_JSON_BASE64"])
images = JSON.parse(images_json)

def gitlab_request(method, url, token, body = nil)
  uri = URI(url)
  request_class = {
    get: Net::HTTP::Get,
    post: Net::HTTP::Post
  }.fetch(method)
  request = request_class.new(uri)
  request["PRIVATE-TOKEN"] = token
  if body
    request["Content-Type"] = "application/json"
    request.body = JSON.generate(body)
  end

  Net::HTTP.start(uri.hostname, uri.port, use_ssl: uri.scheme == "https") do |http|
    http.request(request)
  end
end

def file_exists?(api_v4_url, project_id, token, branch, path)
  encoded_project = URI.encode_www_form_component(project_id)
  encoded_path = URI.encode_www_form_component(path)
  encoded_branch = URI.encode_www_form_component(branch)
  url = "#{api_v4_url}/projects/#{encoded_project}/repository/files/#{encoded_path}?ref=#{encoded_branch}"
  response = gitlab_request(:get, url, token)
  return true if response.code.to_i == 200
  return false if response.code.to_i == 404

  abort("Failed to check file #{path}: #{response.code} #{response.body}")
end

def available_filename(api_v4_url, project_id, token, branch, entries_path, filename)
  base = filename.sub(/\.md\z/i, "")
  candidate = filename
  counter = 2

  while file_exists?(api_v4_url, project_id, token, branch, "#{entries_path}/#{candidate}")
    candidate = "#{base}-#{counter}.md"
    counter += 1
  end

  candidate
end

target_filename = available_filename(api_v4_url, project_id, write_token, target_branch, entries_path, requested_filename)
actions = [
  {
    action: "create",
    file_path: "#{entries_path}/#{target_filename}",
    content: Base64.strict_encode64(markdown),
    encoding: "base64"
  }
]

images.each do |image|
  path = image.fetch("path").to_s
  base64 = image.fetch("base64").to_s
  next if path.empty? || base64.empty?

  actions << {
    action: "create",
    file_path: path,
    content: base64,
    encoding: "base64"
  }
end

encoded_project = URI.encode_www_form_component(project_id)
url = "#{api_v4_url}/projects/#{encoded_project}/repository/commits"
response = gitlab_request(:post, url, write_token, {
  branch: target_branch,
  commit_message: "docs: add troubleshooting entry #{target_filename}",
  actions: actions
})

unless [200, 201].include?(response.code.to_i)
  abort("Failed to create commit: #{response.code} #{response.body}")
end

puts "Created troubleshooting entry: #{entries_path}/#{target_filename}"
